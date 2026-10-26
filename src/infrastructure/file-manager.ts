import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { EntityOptions } from '../core/schema.ts';

export const DEFAULT_CHUNK_SIZE_BYTES = 20 * 1024 * 1024;

export type ChunkManifest = {
  kind: 'gitdb-chunks';
  version: 1;
  directory: string;
  chunks: string[];
};

export function isChunkManifest(value: unknown): value is ChunkManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Partial<ChunkManifest>;
  return manifest.kind === 'gitdb-chunks' && manifest.version === 1 &&
    typeof manifest.directory === 'string' && /^[^/\\]+\.chunks-[0-9a-f-]{36}$/.test(manifest.directory) &&
    Array.isArray(manifest.chunks) && manifest.chunks.length > 0 &&
    manifest.chunks.every((chunk) => typeof chunk === 'string' && /^\d+\.part$/.test(chunk));
}

export async function decodeEntityRows(
  content: string,
  readChunk: (filePath: string) => Promise<Buffer>,
): Promise<unknown[]> {
  let parsed: unknown = JSON.parse(content);
  if (isChunkManifest(parsed)) {
    const buffers: Buffer[] = [];
    for (const chunk of parsed.chunks) {
      buffers.push(await readChunk(`${parsed.directory}/${chunk}`));
    }
    parsed = JSON.parse(Buffer.concat(buffers).toString('utf8'));
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Entity file must contain a JSON array or a chunk manifest');
  }
  return parsed;
}

export class FileManager {
  private readonly entityOptions = new Map<string, EntityOptions>();
  private readonly cachedRows = new Map<string, { signature: string; rows: unknown[] }>();
  private readonly operations = new Map<string, Promise<unknown>>();

  constructor(private readonly basePath: string) {}

  configureEntity(entityName: string, options: EntityOptions = {}): void {
    this.entityOptions.set(entityName, options);
  }

  async migrateLargeFiles(): Promise<boolean> {
    let migrated = false;
    for (const entry of await readdir(this.basePath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'gitdb.manifest.json') continue;
      const entityName = entry.name.slice(0, -5);
      if (this.entityOptions.get(entityName)?.chunk === false) continue;
      if ((await stat(this.getEntityFilePath(entityName))).size <= DEFAULT_CHUNK_SIZE_BYTES) continue;
      const content: unknown = JSON.parse(await readFile(this.getEntityFilePath(entityName), 'utf8'));
      if (!Array.isArray(content)) continue;
      await this.writeEntityRows(entityName, content);
      migrated = true;
    }
    return migrated;
  }

  readEntityRows<T>(entityName: string): Promise<T[]> {
    return this.withEntityAccess(entityName, () => this.readRows<T>(entityName));
  }

  private async readRows<T>(entityName: string): Promise<T[]> {
    await this.ensureEntityFile(entityName);

    const filePath = this.getEntityFilePath(entityName);
    const signature = await this.fileSignature(filePath);
    const cached = this.cachedRows.get(entityName);
    if (cached?.signature === signature) {
      return structuredClone(cached.rows) as T[];
    }
    this.cachedRows.delete(entityName);
    const content = await readFile(filePath, 'utf8');
    const rows = await decodeEntityRows(content, (chunk) => readFile(path.join(this.basePath, chunk)));
    if (isChunkManifest(JSON.parse(content))) {
      this.cachedRows.set(entityName, { signature, rows });
      return structuredClone(rows) as T[];
    }
    return rows as T[];
  }

  writeEntityRows<T>(entityName: string, rows: T[]): Promise<void> {
    return this.withEntityAccess(entityName, () => this.writeRows(entityName, rows));
  }

  private async writeRows<T>(entityName: string, rows: T[]): Promise<void> {
    const filePath = this.getEntityFilePath(entityName);
    const content = Buffer.from(`${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    const previous: unknown = existsSync(filePath) ? JSON.parse(await readFile(filePath, 'utf8')) : null;
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    let directory: string | undefined;
    try {
      if (content.length > DEFAULT_CHUNK_SIZE_BYTES && this.entityOptions.get(entityName)?.chunk !== false) {
        directory = `${entityName}.chunks-${randomUUID()}`;
        await mkdir(path.join(this.basePath, directory));
        const chunks: string[] = [];
        for (let offset = 0; offset < content.length; offset += DEFAULT_CHUNK_SIZE_BYTES) {
          const chunk = `${String(chunks.length).padStart(6, '0')}.part`;
          await writeFile(path.join(this.basePath, directory, chunk), content.subarray(offset, offset + DEFAULT_CHUNK_SIZE_BYTES));
          chunks.push(chunk);
        }
        const manifest: ChunkManifest = { kind: 'gitdb-chunks', version: 1, directory, chunks };
        await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      } else {
        await writeFile(temporaryPath, content);
      }
      await rename(temporaryPath, filePath);
      this.cachedRows.delete(entityName);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (directory) await rm(path.join(this.basePath, directory), { recursive: true, force: true });
      throw error;
    }
    if (isChunkManifest(previous)) {
      await rm(path.join(this.basePath, previous.directory), { recursive: true, force: true });
    }
  }

  private async fileSignature(filePath: string): Promise<string> {
    const info = await stat(filePath);
    return `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  }

  private async withEntityAccess<T>(entityName: string, operation: () => Promise<T>): Promise<T> {
    const pending = this.operations.get(entityName) ?? Promise.resolve();
    const current = pending.then(operation, operation);
    this.operations.set(entityName, current);
    try {
      return await current;
    } finally {
      if (this.operations.get(entityName) === current) this.operations.delete(entityName);
    }
  }

  private async ensureEntityFile(entityName: string): Promise<void> {
    const filePath = this.getEntityFilePath(entityName);

    if (existsSync(filePath)) {
      return;
    }

    await writeFile(filePath, '[]\n', 'utf8');
  }

  private getEntityFilePath(entityName: string): string {
    return path.join(this.basePath, `${entityName}.json`);
  }
}
