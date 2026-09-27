import type { Layout, LayoutKind, TemplateProfile } from '@pm/shared';
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../llm/client.js';

/** Темп русской речи на выступлении, слов в минуту. */
export const WORDS_PER_MINUTE = 130;
const SECONDS_PER_SLIDE = 40;

export interface PlannedSlide {
  kind: LayoutKind;
  goal: string;
  points: string[];
}

export interface Plan {
  title: string;
  slides: PlannedSlide[];
}

const KIND_HINTS: Record<LayoutKind, string> = {
  title: 'титульный: название и подзаголовок',
  section: 'разделитель: одна крупная мысль',
  bullets: 'тезисы списком, 3–6 пунктов',
  text: 'один абзац с главной мыслью',
  'two-column': 'сравнение двух вещей: было/стало, проблема/решение',
  cards: 'несколько равнозначных пунктов карточками',
  'image-text': 'текст рядом с картинкой шаблона',
  closing: 'финал: призыв, контакты, спасибо',
  other: 'свободная композиция',
};

export function targetSlideCount(durationMinutes?: number): number {
  if (!durationMinutes) return 10;
  return Math.min(20, Math.max(4, Math.round((durationMinutes * 60) / SECONDS_PER_SLIDE)));
}

export async function planPresentation(input: {
  llm: LlmClient;
  profile: TemplateProfile;
  brief: string;
  digest: string;
  durationMinutes?: number;
  usage?: LlmUsage;
  signal?: AbortSignal;
}): Promise<Plan> {
  const kinds = availableKinds(input.profile.layouts);
  const count = targetSlideCount(input.durationMinutes);
  const schema = z.object({
    title: z.string(),
    slides: z.array(
      z.object({
        kind: z.enum(kinds as [LayoutKind, ...LayoutKind[]]),
        goal: z.string(),
        points: z.array(z.string()),
      }),
    ),
  });

  const kindList = kinds
    .map((k) => `- ${k}: ${KIND_HINTS[k]}${itemsHint(input.profile.layouts, k)}`)
    .join('\n');
  const plan = await input.llm.object({
    name: 'presentation_plan',
    schema,
    system: [
      'Ты готовишь структуру выступления на русском языке.',
      `Сделай ${count} слайдов (допустимо ±1). Один слайд — одна мысль.`,
      kinds.includes('title') ? 'Первый слайд — kind "title".' : '',
      kinds.includes('closing') ? 'Последний слайд — kind "closing".' : '',
      'title — название самой презентации для титульного слайда (не «план выступления»).',
      'goal — зачем этот слайд, одной фразой.',
      'Чередуй типы слайдов: не больше двух bullets подряд; 2–4 равнозначных пункта — cards, сравнение — two-column.',
      'points — 2–5 конкретных фактов из материалов: цифры, результаты, решения. Ничего не выдумывай.',
      'Отбирай факты под аудиторию из задачи: для жюри и бизнеса — ценность, результат, отличия;',
      'имена полей, переменные окружения и команды CLI — только если аудитория техническая.',
      'Для cards и two-column число points = число карточек/колонок.',
      `Доступные типы слайдов:\n${kindList}`,
    ]
      .filter(Boolean)
      .join('\n'),
    user: [
      `Задача:\n${input.brief}`,
      input.durationMinutes ? `Длительность выступления: ${input.durationMinutes} мин.` : '',
      input.profile.tone ? `Тон бренда:\n${input.profile.tone}` : '',
      input.digest ? `Материалы:\n${input.digest}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    maxTokens: 4_000,
    usage: input.usage,
    signal: input.signal,
  });

  const slides = plan.slides.filter((s) => s.goal.trim());
  if (slides.length === 0) throw new Error('Планировщик вернул пустой план');
  return { title: plan.title.trim(), slides: diversify(slides, input.profile.layouts) };
}

/**
 * Страховка от однообразия (слабые модели ставят тезисы везде): в серии из трёх bullets подряд
 * средний слайд с 2–4 пунктами переводим в карточки или колонки, если в шаблоне есть подходящий макет.
 */
export function diversify(slides: PlannedSlide[], layouts: Layout[]): PlannedSlide[] {
  const result = slides.map((s) => ({ ...s }));
  for (let i = 1; i < result.length - 1; i++) {
    if (![result[i - 1], result[i], result[i + 1]].every((s) => s.kind === 'bullets')) continue;
    const n = result[i].points.length;
    const target = layouts.find(
      (l) => (l.kind === 'cards' || l.kind === 'two-column') && l.items === n,
    );
    if (target) result[i].kind = target.kind;
  }
  return result;
}

export function availableKinds(layouts: Layout[]): LayoutKind[] {
  return [...new Set(layouts.map((l) => l.kind))];
}

function itemsHint(layouts: Layout[], kind: LayoutKind): string {
  if (kind !== 'cards' && kind !== 'two-column') return '';
  const counts = [...new Set(layouts.filter((l) => l.kind === kind).map((l) => l.items))].sort();
  return ` (варианты: ${counts.join(', ')} шт.)`;
}
