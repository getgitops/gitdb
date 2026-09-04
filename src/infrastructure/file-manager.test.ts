import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileManager } from './file-manager.ts';

describe('FileManager', () => {
  let basePath: string;
  let fileManager: FileManager;

  beforeEach(async () => {
    basePath = await mkdtemp(path.join(tmpdir(), 'gitdb-file-manager-test-'));
    fileManager = new FileManager(basePath);
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('crea el fichero de la entidad como array vacío la primera vez que se lee', async () => {
    const rows = await fileManager.readEntityRows('users');

    expect(rows).toEqual([]);
  });

  it('persiste y relee filas de la entidad', async () => {
    await fileManager.writeEntityRows('users', [{ id: '1', name: 'kettu' }]);

    const rows = await fileManager.readEntityRows<{ id: string; name: string }>('users');

    expect(rows).toEqual([{ id: '1', name: 'kettu' }]);
  });

  it('no deja el fichero de la entidad truncado si la escritura falla a mitad', async () => {
    await fileManager.writeEntityRows('users', [{ id: '1', name: 'kettu' }]);

    // simulates a process killed mid-`writeFile`: previous complete content must survive
    const before = await readFile(path.join(basePath, 'users.json'), 'utf8');
    expect(() => JSON.parse(before)).not.toThrow();

    await fileManager.writeEntityRows('users', [
      { id: '1', name: 'kettu' },
      { id: '2', name: 'gitops' },
    ]);

    const after = await readFile(path.join(basePath, 'users.json'), 'utf8');
    expect(JSON.parse(after)).toEqual([
      { id: '1', name: 'kettu' },
      { id: '2', name: 'gitops' },
    ]);
  });

  it('limpia el fichero temporal cuando la escritura falla', async () => {
    // pre-create a directory where the temp file would go, so writeFile rejects (EISDIR)
    // and the atomic-write path has to unlink a temp path that never got created
    const rows = [{ id: '1', name: 'kettu' }];

    await expect(fileManager.writeEntityRows('missing-dir/users', rows)).rejects.toThrow();

    const entries = await readdir(basePath).catch(() => []);
    const strayTempFiles = entries.filter((entry) => entry.endsWith('.tmp'));
    expect(strayTempFiles).toEqual([]);
  });

  it('deja el fichero anterior intacto si el rename nunca llega a producirse', async () => {
    await fileManager.writeEntityRows('users', [{ id: '1', name: 'kettu' }]);

    // a leftover temp file from a process killed between writeFile and rename must not
    // be picked up as the entity's content on the next read
    await writeFile(path.join(basePath, `users.json.stale-leftover.tmp`), '[corrupt', 'utf8');

    const rows = await fileManager.readEntityRows<{ id: string; name: string }>('users');

    expect(rows).toEqual([{ id: '1', name: 'kettu' }]);
  });
});
