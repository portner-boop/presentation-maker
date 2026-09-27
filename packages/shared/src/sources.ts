import { MAX_SOURCES_CHARS } from './constants.js';
import type { SourceFile } from './schemas/presentation.js';

// Правила отбора материалов общие для браузера (web), cli и воркера: одна и та же папка
// даёт одинаковый набор файлов, откуда бы её ни загрузили.

const TEXT_EXTENSIONS = new Set([
  'md',
  'mdx',
  'txt',
  'rst',
  'adoc',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'vue',
  'svelte',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'cs',
  'cpp',
  'c',
  'h',
  'json',
  'yaml',
  'yml',
  'toml',
  'prisma',
  'graphql',
  'sql',
  'proto',
  'html',
  'css',
  'scss',
  'sh',
  'dockerfile',
]);
const TEXT_NAMES = new Set(['Dockerfile', 'Makefile', 'LICENSE']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'vendor',
  'target',
  'storage',
  'generated',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);
const SKIP_FILES =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb|[^/]*\.min\.(js|css)|[^/]*\.map|\.env[^/]*)$/;

export const MAX_SOURCE_FILE_CHARS = 200_000;
/** Чуть меньше лимита api, чтобы запрос гарантированно прошёл. */
export const MAX_COLLECTED_CHARS = Math.floor(MAX_SOURCES_CHARS * 0.9);

export interface CollectedSources {
  files: SourceFile[];
  totalChars: number;
  truncated: boolean;
}

/** Зависимости, сборки, кеши и скрытые папки не читаем. */
export function isSkippedDirectory(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

/** Путь относительно корня материалов: папка, архив или репозиторий. */
export function isTextSourcePath(path: string): boolean {
  const parts = path.split('/');
  if (parts.slice(0, -1).some(isSkippedDirectory)) return false;
  if (SKIP_FILES.test(path)) return false;
  const name = parts.at(-1) ?? path;
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return TEXT_EXTENSIONS.has(ext) || TEXT_NAMES.has(name);
}

export function isBinaryContent(content: string): boolean {
  return content.includes('\u0000');
}

/** Документация первой: если упрёмся в лимит, отрежется код, а не README. */
export function sourcePriority(path: string): number {
  if (/(^|\/)readme[^/]*$/i.test(path)) return 0;
  if (/\.(md|mdx|txt|rst|adoc)$/i.test(path)) return 1;
  return 2;
}

/** Дедупликация, сортировка по важности и обрезка по суммарному лимиту. */
export function finalizeSources(
  files: SourceFile[],
  maxChars = MAX_COLLECTED_CHARS,
): CollectedSources {
  const unique = [...new Map(files.map((f) => [f.path, f])).values()];
  unique.sort(
    (a, b) => sourcePriority(a.path) - sourcePriority(b.path) || a.path.localeCompare(b.path),
  );
  const result: SourceFile[] = [];
  let totalChars = 0;
  for (const file of unique) {
    if (totalChars + file.content.length > maxChars)
      return { files: result, totalChars, truncated: true };
    result.push(file);
    totalChars += file.content.length;
  }
  return { files: result, totalChars, truncated: false };
}

/** Текстовые файлы из .zip. У архивов с GitHub всё лежит в одной корневой папке — она снимается. */
export async function sourcesFromZip(
  data: ArrayBuffer | Uint8Array,
  prefix = '',
): Promise<SourceFile[]> {
  // динамический импорт: в браузере jszip грузится, только когда пользователь добавил архив
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(data);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const roots = new Set(entries.map((f) => f.name.split('/')[0]));
  const strip = roots.size === 1 && entries.every((f) => f.name.includes('/'));
  const files: SourceFile[] = [];
  for (const entry of entries) {
    const path = strip ? entry.name.slice(entry.name.indexOf('/') + 1) : entry.name;
    if (!isTextSourcePath(path)) continue;
    const content = await entry.async('string');
    if (content.length <= MAX_SOURCE_FILE_CHARS && !isBinaryContent(content)) {
      files.push({ path: `${prefix}${path}`, content });
    }
  }
  return files;
}

/** Сервер клонирует только публичные https-репозитории: без ssh-ключей, file:// и локальных путей. */
export const GIT_URL_PATTERN = /^https:\/\/[^\s/$.?#][^\s]*$/i;
