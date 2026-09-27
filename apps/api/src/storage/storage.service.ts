import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/**
 * Файлы шаблонов и результатов на локальном диске. В БД храним ключ, а не абсолютный путь.
 * TODO: S3/MinIO, чтобы api и worker не делили один volume.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('STORAGE_DIR', { infer: true }));
  }

  async save(key: string, data: Uint8Array | string): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }

  pathOf(key: string): string {
    return join(this.root, key);
  }
}
