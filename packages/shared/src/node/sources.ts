import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { SourceFile } from '../schemas/presentation.js';
import {
  type CollectedSources,
  finalizeSources,
  isBinaryContent,
  isSkippedDirectory,
  isTextSourcePath,
  MAX_SOURCE_FILE_CHARS,
  sourcesFromZip,
} from '../sources.js';

const run = promisify(execFile);

/**
 * Собирает материалы к задаче: локальная папка, .zip, git-ссылка (клонируется во временную папку)
 * или отдельный текстовый файл. Только для Node: cli и воркер api.
 */
export async function collectSources(inputs: string[]): Promise<CollectedSources> {
  const files: SourceFile[] = [];
  for (const [i, input] of inputs.entries()) {
    const prefix = i === 0 ? '' : `${basename(input).replace(/\.(zip|git)$/, '')}/`;
    if (isGitUrl(input)) files.push(...(await cloneRepository(input, prefix)));
    else if (input.toLowerCase().endsWith('.zip'))
      files.push(...(await sourcesFromZip(await readFile(input), prefix)));
    else if ((await stat(input)).isDirectory())
      files.push(...(await sourcesFromDirectory(input, prefix)));
    else
      files.push({ path: `${prefix}${basename(input)}`, content: await readFile(input, 'utf8') });
  }
  return finalizeSources(files);
}

export function isGitUrl(input: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(input) || input.endsWith('.git');
}

/** Неглубокий клон без тегов и интерактивных запросов пароля, с таймаутом. */
export async function cloneRepository(
  url: string,
  prefix = '',
  timeoutMs = 90_000,
): Promise<SourceFile[]> {
  const dir = await mkdtemp(join(tmpdir(), 'pm-source-'));
  try {
    await run(
      'git',
      ['clone', '--depth', '1', '--single-branch', '--no-tags', '--quiet', url, dir],
      {
        timeout: timeoutMs,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
      },
    );
    return await sourcesFromDirectory(dir, prefix);
  } catch (error) {
    const message = (error as { stderr?: string }).stderr?.trim() || (error as Error).message;
    throw new Error(`Не удалось склонировать ${url}: ${message.split('\n')[0]}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function sourcesFromDirectory(root: string, prefix = ''): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const base = resolve(root);
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(base, full).split('\\').join('/');
      if (entry.isDirectory()) {
        if (!isSkippedDirectory(entry.name)) await walk(full);
        continue;
      }
      if (!entry.isFile() || !isTextSourcePath(rel)) continue;
      if ((await stat(full)).size > MAX_SOURCE_FILE_CHARS) continue;
      const content = await readFile(full, 'utf8');
      if (!isBinaryContent(content)) files.push({ path: `${prefix}${rel}`, content });
    }
  };
  await walk(base);
  return files;
}
