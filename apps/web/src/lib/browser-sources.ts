import {
  isBinaryContent,
  isTextSourcePath,
  MAX_SOURCE_FILE_CHARS,
  type SourceFile,
  sourcesFromZip,
} from '@pm/shared';

/** Одна добавленная пользователем порция материалов: папка, архив или набор файлов. */
export interface SourceBundle {
  id: string;
  kind: 'folder' | 'zip' | 'files';
  name: string;
  files: SourceFile[];
  skipped: number;
}

/**
 * Папка из <input webkitdirectory>. Корневую папку из пути снимаем, чтобы README в корне
 * репозитория считался главным документом — так же, как в cli и воркере.
 */
export async function bundleFromFolder(fileList: FileList): Promise<SourceBundle> {
  const all = Array.from(fileList);
  const root = all[0]?.webkitRelativePath.split('/')[0] ?? 'Папка';
  const files: SourceFile[] = [];
  let skipped = 0;
  for (const file of all) {
    const path = file.webkitRelativePath.split('/').slice(1).join('/') || file.name;
    const content = await readText(file, path);
    if (content === undefined) skipped++;
    else files.push({ path, content });
  }
  return { id: crypto.randomUUID(), kind: 'folder', name: root, files, skipped };
}

export async function bundleFromZip(file: File): Promise<SourceBundle> {
  const files = await sourcesFromZip(await file.arrayBuffer());
  return { id: crypto.randomUUID(), kind: 'zip', name: file.name, files, skipped: 0 };
}

export async function bundleFromFiles(list: File[]): Promise<SourceBundle> {
  const files: SourceFile[] = [];
  let skipped = 0;
  for (const file of list) {
    const content = await readText(file, file.name);
    if (content === undefined) skipped++;
    else files.push({ path: file.name, content });
  }
  const name = list.length === 1 ? list[0].name : `${list.length} файлов`;
  return { id: crypto.randomUUID(), kind: 'files', name, files, skipped };
}

async function readText(file: File, path: string): Promise<string | undefined> {
  if (!isTextSourcePath(path) || file.size > MAX_SOURCE_FILE_CHARS) return undefined;
  const content = await file.text();
  return isBinaryContent(content) ? undefined : content;
}

export function bundleChars(bundle: SourceBundle): number {
  return bundle.files.reduce((sum, f) => sum + f.content.length, 0);
}
