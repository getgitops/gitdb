import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitRepository } from '../src/infrastructure/git-repository.ts';
import { GitDbLogger } from '../src/infrastructure/logger.ts';

const exec = promisify(execFile);

describe('GitDB branch handling with real Git repositories', () => {
  let root: string;
  let remote: string;
  let dataPath: string;
  let repository: GitRepository | undefined;

  const git = (cwd: string, ...args: string[]) => exec('git', args, { cwd });
  // the environment may set safe.bareRepository=explicit, so address the bare remote via --git-dir
  const gitRemote = (...args: string[]) => exec('git', ['--git-dir', remote, ...args], { cwd: root });

  const createRepository = (branch: string) =>
    new GitRepository({
      dataPath,
      repositoryUrl: remote,
      branch,
      authToken: '',
      authUsername: 'x-access-token',
      autoCommitIntervalMs: 60_000,
      immediateCommitDelayMs: 60_000,
      syncMode: 'poll',
      syncPollSeconds: 0,
      gitUserName: 'test',
      gitUserEmail: 'test@example.com',
      logger: new GitDbLogger(),
    });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'gitdb-branch-git-'));
    remote = path.join(root, 'remote.git');
    dataPath = path.join(root, 'data');
    await git(root, 'init', '--bare', remote);
    await gitRemote('symbolic-ref', 'HEAD', 'refs/heads/main');

    // seed the remote with an initial commit on main so it has a default branch
    const seed = path.join(root, 'seed');
    await git(root, 'clone', remote, seed);
    await git(seed, 'checkout', '-b', 'main');
    await git(seed, 'config', 'user.name', 'test');
    await git(seed, 'config', 'user.email', 'test@example.com');
    await git(seed, 'commit', '--allow-empty', '-m', 'initial');
    await git(seed, 'push', 'origin', 'main');
  });

  afterEach(async () => {
    await repository?.shutdown();
    repository = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it('commits and pushes to the configured branch even when it does not exist remotely', async () => {
    repository = createRepository('develop');
    await repository.initialize();

    const current = (await git(dataPath, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
    expect(current).toBe('develop');

    await writeFile(path.join(dataPath, 'items.json'), '[]');
    await repository.commitNow('test');
    await repository.sync('test');

    const remoteDevelop = (await gitRemote('log', 'develop', '-1', '--format=%s')).stdout;
    expect(remoteDevelop).toContain('gitdb: test');

    // main must stay untouched on the seed commit
    const remoteMain = (await gitRemote('log', 'main', '-1', '--format=%s')).stdout.trim();
    expect(remoteMain).toBe('initial');
  });

  it('checks out an existing remote branch instead of the default one', async () => {
    const seed = path.join(root, 'seed');
    await git(seed, 'checkout', '-b', 'develop');
    await git(seed, 'commit', '--allow-empty', '-m', 'develop tip');
    await git(seed, 'push', 'origin', 'develop');

    repository = createRepository('develop');
    await repository.initialize();

    const current = (await git(dataPath, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
    expect(current).toBe('develop');
    const head = (await git(dataPath, 'log', '-1', '--format=%s')).stdout.trim();
    expect(head).toBe('develop tip');
  });

  it('switches an existing clone that was left on the wrong branch', async () => {
    // simulate a pre-existing clone created before GITDB_BRANCH support: sitting on main
    await git(root, 'clone', remote, dataPath);
    await git(dataPath, 'config', 'user.name', 'test');
    await git(dataPath, 'config', 'user.email', 'test@example.com');
    expect((await git(dataPath, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim()).toBe('main');

    repository = createRepository('develop');
    await repository.initialize();

    const current = (await git(dataPath, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
    expect(current).toBe('develop');

    await writeFile(path.join(dataPath, 'items.json'), '[]');
    await repository.commitNow('test');
    await repository.sync('test');

    expect((await gitRemote('log', 'develop', '-1', '--format=%s')).stdout).toContain('gitdb: test');
    expect((await gitRemote('log', 'main', '-1', '--format=%s')).stdout.trim()).toBe('initial');
  });

  it('stays on the clone default branch when no branch is configured', async () => {
    repository = createRepository('');
    await repository.initialize();

    const current = (await git(dataPath, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
    expect(current).toBe('main');
  });
});
