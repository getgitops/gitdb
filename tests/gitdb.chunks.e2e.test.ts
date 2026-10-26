import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitDb, GitDB } from '../src/core/gitdb.ts';
import { entity, integer, text } from '../src/core/schema.ts';
import { DEFAULT_CHUNK_SIZE_BYTES, FileManager, type ChunkManifest } from '../src/infrastructure/file-manager.ts';
import { GitRepository } from '../src/infrastructure/git-repository.ts';
import { GitDbLogger } from '../src/infrastructure/logger.ts';

const exec = promisify(execFile);

describe('GitDB chunks with real Git repositories', () => {
  let root: string;
  let remote: string;
  let dataPath: string;
  let db: GitDB | undefined;
  let repository: GitRepository | undefined;

  const git = (cwd: string, ...args: string[]) => exec('git', args, { cwd });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'gitdb-chunks-git-'));
    remote = path.join(root, 'remote.git');
    dataPath = path.join(root, 'data');
    await git(root, 'init', '--bare', remote);
    await git(root, 'clone', remote, dataPath);
    await git(dataPath, 'config', 'user.name', 'test');
    await git(dataPath, 'config', 'user.email', 'test@example.com');
  });

  afterEach(async () => {
    await db?.close();
    await repository?.shutdown();
    db = undefined;
    repository = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it('migrates legacy tables during ready, pushes them and reads a fresh clone', async () => {
    const rows = [{ id: 1, value: 'a'.repeat(DEFAULT_CHUNK_SIZE_BYTES) }];
    await writeFile(path.join(dataPath, 'items.json'), JSON.stringify(rows));
    await git(dataPath, 'add', '-A');
    await git(dataPath, 'commit', '-m', 'legacy table');
    db = gitDb(remote, {
      dataPath, authToken: '', syncPollSeconds: 0,
      immediateCommitDelayMs: 60_000, autoCommitIntervalMs: 60_000,
    });
    await db.ready();
    const manifest: ChunkManifest = JSON.parse(await readFile(path.join(dataPath, 'items.json'), 'utf8'));
    expect(manifest.kind).toBe('gitdb-chunks');
    const items = entity('items', { id: integer(), value: text() });
    expect((await db.select().from(items)).rows).toEqual(rows);
    await db.close();
    db = undefined;
    const cloned = path.join(root, 'cloned');
    await git(root, 'clone', remote, cloned);
    expect(await new FileManager(cloned).readEntityRows('items')).toEqual(rows);
    for (const chunk of manifest.chunks) {
      expect((await stat(path.join(cloned, manifest.directory, chunk))).size).toBeLessThanOrEqual(DEFAULT_CHUNK_SIZE_BYTES);
    }
    expect((await git(cloned, 'log', '-1', '--format=%s')).stdout).toContain('migrate:chunks');
  });

  it('honors schema opt-out before migrating existing tables', async () => {
    const rows = [{ id: 1, value: 'a'.repeat(DEFAULT_CHUNK_SIZE_BYTES) }];
    await writeFile(path.join(dataPath, 'items.json'), JSON.stringify(rows));
    await git(dataPath, 'add', '-A');
    await git(dataPath, 'commit', '-m', 'legacy table');
    const items = entity('items', { id: integer(), value: text() }, { chunk: false });
    db = gitDb(remote, { dataPath, authToken: '', entities: [items], syncPollSeconds: 0 });
    await db.ready();
    expect(Array.isArray(JSON.parse(await readFile(path.join(dataPath, 'items.json'), 'utf8')))).toBe(true);
    expect((await readdir(dataPath)).some((name) => name.includes('.chunks-'))).toBe(false);
  });

  it('reconstructs historical Unicode chunks and diffs across storage formats', async () => {
    repository = new GitRepository({
      dataPath, repositoryUrl: remote, authToken: '', authUsername: 'x-access-token',
      autoCommitIntervalMs: 60_000, immediateCommitDelayMs: 60_000,
      syncMode: 'poll', syncPollSeconds: 0, gitUserName: 'test', gitUserEmail: 'test@example.com',
      logger: new GitDbLogger(),
    });
    await repository.initialize();
    const manager = new FileManager(dataPath);
    const items = entity('items', { id: integer(), value: text() });
    db = new GitDB(repository, manager);
    await db.insert(items).values({ id: 1, value: 'small' });
    await repository.commitNow();
    const value = '\u20ac'.repeat(Math.ceil(DEFAULT_CHUNK_SIZE_BYTES / 3));
    await db.update(items).set({ value }).where({ id: 1 });
    await repository.commitNow();
    const revision = (await git(dataPath, 'rev-parse', 'HEAD')).stdout.trim();
    expect(await repository.getEntityFileAt(revision, 'items')).toEqual([{ id: 1, value }]);
    expect(await repository.getEntityDiff(revision, 'items')).toEqual({
      before: [{ id: 1, value: 'small' }], after: [{ id: 1, value }],
    });
    expect(await db.entityDiff(revision, 'items')).toHaveLength(1);
    await db.delete(items).where({ id: 1 });
    await repository.commitNow();
    expect(await manager.readEntityRows('items')).toEqual([]);
    expect(await repository.getEntityFileAt(revision, 'items')).toEqual([{ id: 1, value }]);
    expect(await repository.getEntityFileAt('HEAD', 'items')).toEqual([]);
    await db.close();
    db = undefined;
    repository = undefined;
  }, 20_000);
});