import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CHUNK_SIZE_BYTES, FileManager, type ChunkManifest } from './file-manager.ts';

describe('FileManager chunk storage', () => {
  let basePath: string;
  let manager: FileManager;

  beforeEach(async () => {
    basePath = await mkdtemp(path.join(tmpdir(), 'gitdb-chunks-'));
    manager = new FileManager(basePath);
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('keeps files at the threshold intact and chunks files above it by default', async () => {
    const overhead = Buffer.byteLength(`${JSON.stringify([''], null, 2)}\n`);
    const rows = ['a'.repeat(DEFAULT_CHUNK_SIZE_BYTES - overhead)];
    await manager.writeEntityRows('items', rows);
    expect((await stat(path.join(basePath, 'items.json'))).size).toBe(DEFAULT_CHUNK_SIZE_BYTES);
    expect(JSON.parse(await readFile(path.join(basePath, 'items.json'), 'utf8'))).toEqual(rows);

    rows[0] += 'a';
    await manager.writeEntityRows('items', rows);
    const manifest: ChunkManifest = JSON.parse(await readFile(path.join(basePath, 'items.json'), 'utf8'));
    expect(manifest.kind).toBe('gitdb-chunks');
    expect(manifest.chunks).toHaveLength(2);
    for (const chunk of manifest.chunks) {
      expect((await stat(path.join(basePath, manifest.directory, chunk))).size).toBeLessThanOrEqual(DEFAULT_CHUNK_SIZE_BYTES);
    }
    expect(await new FileManager(basePath).readEntityRows('items')).toEqual(rows);
  });

  it('reconstructs Unicode split across byte boundaries and removes obsolete chunks', async () => {
    const rows = ['\u20ac'.repeat(Math.ceil(DEFAULT_CHUNK_SIZE_BYTES / 3))];
    await manager.writeEntityRows('items', rows);
    expect(await manager.readEntityRows('items')).toEqual(rows);
    await manager.writeEntityRows('items', rows);
    expect((await readdir(basePath)).filter((entry) => entry.startsWith('items.chunks-'))).toHaveLength(1);
    await manager.writeEntityRows('items', []);
    expect(await manager.readEntityRows('items')).toEqual([]);
    expect(await readdir(basePath)).toEqual(['items.json']);
  });

  it('supports opting out per entity', async () => {
    manager.configureEntity('items', { chunk: false });
    const rows = ['a'.repeat(DEFAULT_CHUNK_SIZE_BYTES)];
    await manager.writeEntityRows('items', rows);
    expect(await readdir(basePath)).toEqual(['items.json']);
    expect(await manager.readEntityRows('items')).toEqual(rows);
  });

  it('isolates cached rows and invalidates the cache when another manager writes', async () => {
    const rows = [{ value: 'a'.repeat(DEFAULT_CHUNK_SIZE_BYTES) }];
    await manager.writeEntityRows('items', rows);
    const result = await manager.readEntityRows<{ value: string }>('items');
    result[0].value = 'mutated';
    expect(await manager.readEntityRows('items')).toEqual(rows);
    await new FileManager(basePath).writeEntityRows('items', [{ value: 'external' }]);
    expect(await manager.readEntityRows('items')).toEqual([{ value: 'external' }]);
  });

  it('migrates existing large tables without touching small files or metadata', async () => {
    const rows = ['a'.repeat(DEFAULT_CHUNK_SIZE_BYTES)];
    await writeFile(path.join(basePath, 'items.json'), JSON.stringify(rows));
    await writeFile(path.join(basePath, 'small.json'), '[]\n');
    await writeFile(path.join(basePath, 'metadata.json'), JSON.stringify({ value: rows[0] }));
    expect(await manager.migrateLargeFiles()).toBe(true);
    expect(await manager.readEntityRows('items')).toEqual(rows);
    expect(await readFile(path.join(basePath, 'small.json'), 'utf8')).toBe('[]\n');
    expect(await manager.migrateLargeFiles()).toBe(false);
  });
});