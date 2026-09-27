import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface PreviewOptions {
  /** Бинарник LibreOffice, по умолчанию `soffice` из PATH. */
  soffice?: string;
  /** Бинарник poppler для pdf → png, по умолчанию `pdftoppm`. */
  pdftoppm?: string;
  /** Ширина картинки слайда в пикселях. */
  width?: number;
  timeoutMs?: number;
}

let available: Promise<boolean> | undefined;

/** Есть ли LibreOffice и poppler: без них превью просто не строится, генерация не падает. */
export function previewAvailable(options: PreviewOptions = {}): Promise<boolean> {
  available ??= Promise.all([
    run(options.soffice ?? 'soffice', ['--version'], { timeout: 15_000 }),
    run(options.pdftoppm ?? 'pdftoppm', ['-v'], { timeout: 15_000 }),
  ]).then(
    () => true,
    () => false,
  );
  return available;
}

/**
 * PNG каждого слайда через LibreOffice (pptx → pdf) и poppler (pdf → png).
 * У каждого вызова свой профиль LibreOffice, поэтому параллельные генерации не мешают друг другу.
 */
export async function renderPreviews(
  pptx: Uint8Array,
  options: PreviewOptions = {},
): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), 'pm-preview-'));
  const timeout = options.timeoutMs ?? 60_000;
  try {
    const deck = join(dir, 'deck.pptx');
    await writeFile(deck, pptx);
    await run(
      options.soffice ?? 'soffice',
      [
        `-env:UserInstallation=${pathToFileURL(join(dir, 'profile')).href}`,
        '--headless',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        dir,
        deck,
      ],
      { timeout },
    );
    await run(
      options.pdftoppm ?? 'pdftoppm',
      [
        '-png',
        '-scale-to',
        String(options.width ?? 1280),
        join(dir, 'deck.pdf'),
        join(dir, 'slide'),
      ],
      { timeout },
    );
    // pdftoppm дополняет номер нулями под число страниц: slide-01.png … slide-12.png
    const images = (await readdir(dir)).filter((f) => /^slide-\d+\.png$/.test(f)).sort();
    return Promise.all(images.map((f) => readFile(join(dir, f))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
