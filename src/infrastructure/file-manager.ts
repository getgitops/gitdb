import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class FileManager {
  constructor(private readonly basePath: string) {}

  async readEntityRows<T>(entityName: string): Promise<T[]> {
    await this.ensureEntityFile(entityName);

    const filePath = this.getEntityFilePath(entityName);
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(`Entity file ${entityName}.json must contain a JSON array`);
    }

    return parsed as T[];
  }

  async writeEntityRows<T>(entityName: string, rows: T[]): Promise<void> {
    const filePath = this.getEntityFilePath(entityName);
    await this.writeFileAtomic(filePath, `${JSON.stringify(rows, null, 2)}\n`);
  }

  private async ensureEntityFile(entityName: string): Promise<void> {
    const filePath = this.getEntityFilePath(entityName);

    if (existsSync(filePath)) {
      return;
    }

    await this.writeFileAtomic(filePath, '[]\n');
  }

  /**
   * Writes to a sibling temp file and renames it over the target. `rename` is atomic on the
   * same filesystem, so a process killed mid-write (e.g. Cloud Run SIGKILL) leaves either the
   * previous complete file or a stray `*.tmp` — never a truncated entity file that would
   * corrupt the next commit pushed to the remote.
   */
  private async writeFileAtomic(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.${randomUUID()}.tmp`;

    try {
      await writeFile(tempPath, content, 'utf8');
      await rename(tempPath, filePath);
    } catch (error) {
      await unlink(tempPath).catch(() => {
        // best-effort cleanup, the write already failed
      });
      throw error;
    }
  }

  private getEntityFilePath(entityName: string): string {
    return path.join(this.basePath, `${entityName}.json`);
  }
}
