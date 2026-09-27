import type { TemplateProfile } from '@pm/shared';
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../llm/client.js';
import { PptxPackage } from '../pptx/package.js';
import { type PresentationInfo, parsePresentation, type ShapeInfo } from '../pptx/parse.js';
import { buildLayoutLibrary } from './layouts.js';

export const ANALYZER_VERSION = 1;

export interface AnalyzeTemplateInput {
  data: Uint8Array;
  /** Без LLM анализ тоже работает, просто без описания тона. */
  llm?: LlmClient;
  usage?: LlmUsage;
  signal?: AbortSignal;
}

/**
 * Подготовительный этап, время не ограничено: геометрия, кегли, палитра и шрифты берутся из XML точно,
 * LLM только формулирует тон бренда по текстам шаблона.
 */
export async function analyzeTemplate({
  data,
  llm,
  usage,
  signal,
}: AnalyzeTemplateInput): Promise<TemplateProfile> {
  const info = await parsePresentation(await PptxPackage.load(data));
  const library = buildLayoutLibrary(info);
  const warnings = [...library.warnings];
  if (!info.hasNotesMaster)
    warnings.push('В шаблоне нет мастера заметок: текст спикера не попадёт в заметки .pptx');

  let tone: string | undefined;
  if (llm) {
    try {
      tone = await describeTone(llm, info, { usage, signal });
    } catch (error) {
      warnings.push(`Тон бренда не определён: ${(error as Error).message}`);
    }
  }

  return {
    version: ANALYZER_VERSION,
    slideSize: { widthEmu: info.slideSize.cx, heightEmu: info.slideSize.cy },
    colors: palette(info),
    fonts: {
      heading: dominantTypeface(library.titleShapes) ?? info.theme.fonts.major,
      body: dominantTypeface(library.bodyShapes) ?? info.theme.fonts.minor,
    },
    layouts: library.layouts,
    tone,
    warnings,
  };
}

/** Цвета темы плюс самые частые цвета, заданные прямо на слайдах (дизайнерские шаблоны часто так делают). */
function palette(info: PresentationInfo): string[] {
  const themeKeys = [
    'dk1',
    'lt1',
    'dk2',
    'lt2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
  ];
  const counts = new Map<string, number>();
  for (const shape of info.slides.flatMap((s) => s.shapes)) {
    for (const color of shape.colors) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const used = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c]) => c);
  const fromTheme = themeKeys.map((k) => info.theme.colors[k]).filter(Boolean);
  return [...new Set([...used, ...fromTheme])].slice(0, 12);
}

function dominantTypeface(shapes: ShapeInfo[]): string | undefined {
  const counts = new Map<string, number>();
  for (const p of shapes.flatMap((s) => s.paragraphs)) {
    if (p.typeface) counts.set(p.typeface, (counts.get(p.typeface) ?? 0) + p.text.length);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const ToneSchema = z.object({ tone: z.string() });

async function describeTone(
  llm: LlmClient,
  info: PresentationInfo,
  { usage, signal }: { usage?: LlmUsage; signal?: AbortSignal },
): Promise<string | undefined> {
  const texts = [
    ...new Set(
      info.slides.flatMap((s) => s.shapes.map((sh) => sh.text.trim())).filter((t) => t.length > 3),
    ),
  ];
  const corpus = texts.join('\n').slice(0, 8_000);
  if (corpus.length < 40) return undefined;

  const { tone } = await llm.object({
    name: 'brand_tone',
    schema: ToneSchema,
    system:
      'Ты редактор бренда. По текстам со слайдов опиши тон и стиль формулировок: 4–6 коротких правил ' +
      '(язык, обращение к аудитории, длина фраз, лексика, как строятся заголовки). ' +
      'Правила должны описывать манеру, а не перечислять фразы для повторения. Пиши по-русски, до 600 символов.',
    user: corpus,
    maxTokens: 800,
    usage,
    signal,
  });
  return tone.trim().slice(0, 1_000);
}
