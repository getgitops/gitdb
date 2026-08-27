import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GitDbOptions } from '../types.ts';
import {
  filterAuditEvents,
  formatAuditLogArgs,
  parseAuditLog,
  type AuditActor,
  type AuditQueryOptions,
  type AuditQueryResult,
} from '../core/audit.ts';

export type ResolvedGitDbOptions = Required<Omit<GitDbOptions, 'logger'>> & {
  logger: any;
  dataPath: string;
};

export class GitRepository {
  private readonly repoPath: string;
  private readonly repositoryUrl: string;
  private readonly autoCommitIntervalMs: number;
  private readonly immediateCommitDelayMs: number;
  private readonly syncPollMs: number;
  private readonly gitUserName: string;
  private readonly gitUserEmail: string;
  private readonly manifestPath: string;
  private readonly logger: any;

  private hasPendingCommit = false;
  private pendingReasons = new Set<string>();
  private pendingActor: AuditActor | null = null;
  private commitTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private commitQueue: Promise<void> = Promise.resolve();

  constructor(options: ResolvedGitDbOptions) {
    this.repositoryUrl = options.repositoryUrl;
    this.repoPath = options.dataPath;
    this.manifestPath = path.join(this.repoPath, 'gitdb.manifest.json');
    this.autoCommitIntervalMs = options.autoCommitIntervalMs;
    this.immediateCommitDelayMs = options.immediateCommitDelayMs;
    this.syncPollMs = Math.max(0, options.syncPollSeconds) * 1000;
    this.gitUserName = options.gitUserName;
    this.gitUserEmail = options.gitUserEmail;
    this.logger = options.logger;
  }

  async initialize(): Promise<void> {
    this.logger.info('[gitdb] initializing repository');

    if (!existsSync(this.repoPath)) {
      await mkdir(this.repoPath, { recursive: true });
    }

    if (!existsSync(path.join(this.repoPath, '.git'))) {
      this.logger.info('[gitdb] cloning repository');
      await this.runGit(['clone', this.repositoryUrl, this.repoPath], false, process.cwd());
      this.logger.info('[gitdb] clone completed');
    }

    await this.runGit(['config', 'user.name', this.gitUserName]);
    await this.runGit(['config', 'user.email', this.gitUserEmail]);

    if (!existsSync(this.manifestPath)) {
      this.logger.info('[gitdb] writing manifest');
      await writeFile(
        this.manifestPath,
        `${JSON.stringify(
          {
            kind: 'gitdb',
            repositoryUrl: this.repositoryUrl,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      this.logger.info('[gitdb] manifest written');
    }

    this.intervalTimer = setInterval(() => {
      void this.commitNow('auto-interval').catch(() => {
        // Background auto-commits must not create unhandled rejections.
      });
    }, this.autoCommitIntervalMs);

    if (this.syncPollMs > 0) {
      this.syncTimer = setInterval(() => {
        void this.sync('auto-poll').catch(() => {
          // Background syncs must not create unhandled rejections.
        });
      }, this.syncPollMs);
    }
  }

  queueBackgroundCommit(reason: string, actor?: AuditActor): void {
    this.hasPendingCommit = true;
    this.pendingReasons.add(reason);
    if (actor) {
      // last actor to queue a change before the debounced commit fires wins the attribution
      this.pendingActor = actor;
    }

    if (this.commitTimer) {
      return;
    }

    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      void this.commitNow('auto-background').catch(() => {
        // Background commits must not create unhandled rejections.
      });
    }, this.immediateCommitDelayMs);
  }

  async commitNow(reason = 'manual'): Promise<void> {
    this.pendingReasons.add(reason);

    const runCommit = async () => {
      const reasons = Array.from(this.pendingReasons);
      const actor = this.pendingActor;
      this.pendingReasons.clear();
      this.pendingActor = null;

      this.logger.info('[gitdb] commit started');

      await this.runGit(['add', '-A']);

      const hasChanges = await this.hasStagedChanges();
      if (!hasChanges) {
        this.hasPendingCommit = false;
        this.logger.info('[gitdb] commit skipped, no staged changes', { repoPath: this.repoPath, reasons });
        return;
      }

      const message = `gitdb: ${reasons.join(', ') || 'update'} @ ${new Date().toISOString()}`;
      const commitArgs = ['commit', '-m', message];
      if (actor) {
        commitArgs.push('--author', `${actor.name} <${actor.email}>`);
      }
      await this.runGit(commitArgs);
      this.hasPendingCommit = false;
      this.logger.info('[gitdb] commit completed');
    };

    this.commitQueue = this.commitQueue.then(runCommit, runCommit);

    return this.commitQueue;
  }

  /** Pushes the local commits that are ahead of the remote branch. Never commits. */
  async sync(reason = 'manual'): Promise<void> {
    const runSync = async () => {
      const pending = await this.getPendingCommits();

      if (pending === 0) {
        this.logger.info('[gitdb] sync skipped, nothing to push', { repoPath: this.repoPath, reason });
        return;
      }

      const branch = await this.getCurrentBranch();
      this.logger.info('[gitdb] push started', { repoPath: this.repoPath, reason, branch, pending });

      try {
        await this.runGit(['push', '--set-upstream', 'origin', branch]);
        this.logger.info('[gitdb] push completed', { repoPath: this.repoPath, branch, pushed: pending });
      } catch (error) {
        this.logger.error('[gitdb] push failed', { repoPath: this.repoPath, branch, error: String(error) });
        throw error;
      }
    };

    this.commitQueue = this.commitQueue.then(runSync, runSync);

    return this.commitQueue;
  }

  /** Number of local commits not present on the remote branch. */
  async getPendingCommits(): Promise<number> {
    const branch = await this.getCurrentBranch();
    const remoteRef = `origin/${branch}`;

    const hasRemoteBranch = (await this.runGit(['rev-parse', '--verify', '--quiet', remoteRef], true)) === 0;
    const range = hasRemoteBranch ? `${remoteRef}..HEAD` : 'HEAD';

    const output = await this.captureGit(['rev-list', '--count', range], true);
    const count = Number.parseInt(output.trim(), 10);

    return Number.isNaN(count) ? 0 : count;
  }

  /** True when there is nothing pending to commit nor to push. */
  async isSynced(): Promise<boolean> {
    const pending = await this.getPendingCommits();
    if (pending > 0) {
      return false;
    }

    const dirty = (await this.captureGit(['status', '--porcelain'], true)).trim();
    return dirty.length === 0 && !this.hasPendingCommit;
  }

  /** Reads and parses the commit history into audit events, applying search/pagination. */
  async getAuditEvents(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    const output = await this.captureGit(formatAuditLogArgs(), true);
    const events = parseAuditLog(output);
    return filterAuditEvents(events, options);
  }

  /** Contents of `<entity>.json` at a given revision, or null when it didn't exist there. */
  async getEntityFileAt(revision: string, entity: string): Promise<unknown[] | null> {
    try {
      const content = await this.captureGit(['show', `${revision}:${entity}.json`]);
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Entity rows before and after the given commit, for row-level diffing. */
  async getEntityDiff(commitHash: string, entity: string): Promise<{ before: unknown[] | null; after: unknown[] | null }> {
    const [before, after] = await Promise.all([
      this.getEntityFileAt(`${commitHash}^`, entity),
      this.getEntityFileAt(commitHash, entity),
    ]);
    return { before, after };
  }

  async shutdown(): Promise<void> {
    this.logger.info('[gitdb] shutting down repository');

    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.hasPendingCommit || this.pendingReasons.size > 0) {
      await this.commitNow('shutdown');
    }

    if (this.syncPollMs > 0) {
      await this.sync('shutdown').catch(() => {
        // Shutdown must not fail because the remote is unreachable.
      });
    }

    await this.commitQueue;
    this.logger.info('[gitdb] repository shutdown completed', { repoPath: this.repoPath });
  }

  private async hasStagedChanges(): Promise<boolean> {
    const result = await this.runGit(['diff', '--cached', '--quiet'], true);
    return result !== 0;
  }

  private async getCurrentBranch(): Promise<string> {
    const branch = (await this.captureGit(['rev-parse', '--abbrev-ref', 'HEAD'], true)).trim();
    return branch && branch !== 'HEAD' ? branch : 'main';
  }

  private captureGit(args: string[], allowFailure = false): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd: this.repoPath, stdio: 'pipe' });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', reject);

      child.on('close', (code) => {
        if (!allowFailure && code !== 0) {
          reject(new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`));
          return;
        }

        resolve(stdout);
      });
    });
  }

  private runGit(args: string[], allowFailure = false, cwd = this.repoPath): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd,
        stdio: 'pipe',
      });

      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', reject);

      child.on('close', (code) => {
        const exitCode = code ?? 1;
        if (!allowFailure && exitCode !== 0) {
          reject(new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`));
          return;
        }

        resolve(exitCode);
      });
    });
  }
}
