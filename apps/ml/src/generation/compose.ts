import { type Layout, type Slot, slotLabel } from '@pm/shared';
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../llm/client.js';
import { charBudget, fitSlot, itemBudget, maxItems, truncateToFit } from './fit.js';
import { type PlannedSlide, WORDS_PER_MINUTE } from './plan.js';

export interface ComposedSlide {
  texts: Map<string, string[]>;
  fontScales: Map<string, number>;
  speakerNotes: string;
  warnings: string[];
}

interface ComposeInput {
  llm: LlmClient;
  layout: Layout;
  planned: PlannedSlide;
  deckTitle: string;
  position: { index: number; total: number };
  durationSeconds: number;
  tone?: string;
  brief: string;
  usage?: LlmUsage;
  signal?: AbortSignal;
}

/**
 * Одинаковый для всех слайдов системный промпт — провайдеры кешируют общий префикс,
 * а 30B-модели проще держать короткие правила, чем длинную инструкцию.
 */
function systemPrompt(tone?: string): string {
  return [
    'Ты пишешь текст одного слайда и то, что спикер говорит на этом слайде. Язык — русский.',
    'Строго соблюдай лимиты символов и пунктов. Слайд — короткая опора для глаз, подробности — в speakerNotes.',
    'Без markdown, без маркеров и нумерации в начале пунктов, без кавычек вокруг всего текста.',
    'Факты бери только из цели и тезисов слайда, ничего не выдумывай.',
    'Текст карточки или колонки не начинай с повтора её заголовка.',
    'speakerNotes — живая устная речь от первого лица команды, не пересказ слайда слово в слово.',
    'Не заканчивай слайд благодарностью: «спасибо» уместно только на финальном слайде.',
    tone
      ? `Стиль бренда (следуй манере, но не вставляй характерные фразы в каждый слайд):\n${tone}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function composeSlide(input: ComposeInput): Promise<ComposedSlide> {
  const { layout, planned } = input;
  const shape: Record<string, z.ZodType> = {};
  for (const slot of layout.slots)
    shape[slot.key] = slot.bullets ? z.array(z.string()) : z.string();
  shape.speakerNotes = z.string();
  const schema = z.object(shape);

  const words = Math.max(15, Math.round((input.durationSeconds * WORDS_PER_MINUTE) / 60));
  const raw = (await input.llm.object({
    name: 'slide',
    schema,
    system: systemPrompt(input.tone),
    user: [
      `Презентация: «${input.deckTitle}». Слайд ${input.position.index + 1} из ${input.position.total}.`,
      `Цель слайда: ${planned.goal}`,
      `Тезисы:\n${planned.points.map((p) => `- ${p}`).join('\n')}`,
      `Поля слайда:\n${layout.slots.map(describeSlot).join('\n')}`,
      `speakerNotes: ${words}–${Math.round(words * 1.15)} слов (${input.durationSeconds} с речи), не меньше ${words}.`,
    ].join('\n\n'),
    maxTokens: 1_500,
    usage: input.usage,
    signal: input.signal,
  })) as Record<string, string | string[]>;

  return fitComposed(input, raw);
}

function describeSlot(slot: Slot): string {
  // текст образца из шаблона не показываем: слабые модели его копируют, длину задаёт лимит
  if (slot.bullets) {
    return `- ${slot.key} (${slot.role}): массив из 2–${maxItems(slot)} пунктов, каждый до ${itemBudget(slot)} символов.`;
  }
  return `- ${slot.key} (${slot.role}): строка до ${charBudget(slot)} символов.`;
}

/** Проверка вместимости: ужать кегль → попросить LLM сократить → обрезать. */
async function fitComposed(
  input: ComposeInput,
  raw: Record<string, string | string[]>,
): Promise<ComposedSlide> {
  const texts = new Map<string, string[]>();
  const fontScales = new Map<string, number>();
  const warnings: string[] = [];
  const overflow: Slot[] = [];

  for (const slot of input.layout.slots) {
    const paragraphs = toParagraphs(raw[slot.key], slot);
    texts.set(slot.key, paragraphs);
    const fit = fitSlot(slot, paragraphs);
    fontScales.set(slot.key, fit.fontScale);
    if (!fit.fits) overflow.push(slot);
  }

  if (overflow.length > 0) {
    try {
      const shortened = await shorten(input, overflow, texts);
      for (const slot of overflow) {
        const paragraphs = toParagraphs(shortened[slot.key], slot);
        if (paragraphs.length > 0) texts.set(slot.key, paragraphs);
      }
    } catch (error) {
      warnings.push(`Не удалось сократить текст: ${(error as Error).message}`);
    }
    for (const slot of overflow) {
      let paragraphs = texts.get(slot.key)!;
      let fit = fitSlot(slot, paragraphs);
      if (!fit.fits) {
        paragraphs = truncateToFit(slot, paragraphs);
        texts.set(slot.key, paragraphs);
        fit = fitSlot(slot, paragraphs);
        warnings.push(`${slotLabel(slot.key)}: текст сокращён, чтобы влезть в макет`);
      }
      fontScales.set(slot.key, fit.fontScale);
    }
  }

  return {
    texts,
    fontScales,
    speakerNotes: String(raw.speakerNotes ?? '').trim(),
    warnings,
  };
}

async function shorten(input: ComposeInput, slots: Slot[], texts: Map<string, string[]>) {
  const shape: Record<string, z.ZodType> = {};
  for (const slot of slots) shape[slot.key] = slot.bullets ? z.array(z.string()) : z.string();
  const current = slots.map(
    (slot) =>
      `- ${slot.key}: лимит ${describeLimit(slot)}. Сейчас: ${JSON.stringify(slot.bullets ? texts.get(slot.key) : texts.get(slot.key)!.join(' '))}`,
  );
  return (await input.llm.object({
    name: 'shorten',
    schema: z.object(shape),
    system:
      'Сократи тексты слайда до лимитов, сохранив смысл и факты. Язык — русский, без markdown.',
    user: current.join('\n'),
    maxTokens: 800,
    usage: input.usage,
    signal: input.signal,
  })) as Record<string, string | string[]>;
}

function describeLimit(slot: Slot): string {
  if (!slot.bullets) return `${charBudget(slot)} символов`;
  return `до ${maxItems(slot)} пунктов по ${itemBudget(slot)} символов`;
}

function toParagraphs(value: string | string[] | undefined, slot: Slot): string[] {
  const list = Array.isArray(value) ? value : String(value ?? '').split('\n');
  const cleaned = list
    .map((p) => p.replace(/^\s*(?:[-•*–]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
  return slot.bullets
    ? cleaned.slice(0, maxItems(slot))
    : cleaned.length > 0
      ? [cleaned.join(' ')]
      : [];
}

/** Если LLM упала или не уложилась во время, слайд всё равно собирается из плана. */
export function fallbackSlide(
  layout: Layout,
  planned: PlannedSlide,
  reason: string,
): ComposedSlide {
  const texts = new Map<string, string[]>();
  const fontScales = new Map<string, number>();
  const bodySlots = layout.slots.filter((s) => s.role !== 'title' && s.role !== 'subtitle');
  for (const slot of layout.slots) {
    let paragraphs: string[] = [];
    if (slot.role === 'title') paragraphs = [planned.goal];
    else if (slot.role === 'subtitle') paragraphs = planned.points.slice(0, 1);
    else if (bodySlots.length === 1) paragraphs = planned.points;
    else paragraphs = planned.points.slice(bodySlots.indexOf(slot), bodySlots.indexOf(slot) + 1);
    paragraphs = truncateToFit(
      slot,
      slot.bullets ? paragraphs : [paragraphs.join(' ')].filter(Boolean),
    );
    texts.set(slot.key, paragraphs);
    fontScales.set(slot.key, fitSlot(slot, paragraphs).fontScale);
  }
  return {
    texts,
    fontScales,
    speakerNotes: planned.points.join('. '),
    warnings: [`Слайд собран из плана без LLM: ${reason}`],
  };
}
