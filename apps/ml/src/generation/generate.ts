import type {
  GenerationProgress,
  GenerationStats,
  Layout,
  Slide,
  SourceFile,
  TemplateProfile,
} from '@pm/shared';
import { type LlmClient, LlmUsage } from '../llm/client.js';
import { renderNative, type SlideFill } from '../render/native.js';
import { type ComposedSlide, composeSlide, fallbackSlide } from './compose.js';
import { buildDigest } from './digest.js';
import { planPresentation, targetSlideCount } from './plan.js';
import { selectLayout } from './select-layout.js';

export interface GeneratePresentationInput {
  template: Uint8Array;
  profile: TemplateProfile;
  brief: string;
  durationMinutes?: number;
  sources?: SourceFile[];
  llm: LlmClient;
  signal?: AbortSignal;
  /** Этапы для живого статуса в интерфейсе. */
  onProgress?: (progress: GenerationProgress) => void;
}

export interface GeneratedPresentation {
  title: string;
  slides: Slide[];
  pptx: Uint8Array;
  /** Текст выступления целиком, по слайдам. */
  script: string;
  stats: GenerationStats;
}

const SHORT_KINDS = new Set(['title', 'section', 'closing']);

/**
 * План → выбор макетов кодом → слайды параллельно → подгонка → нативный рендер.
 * Весь путь укладывается в GENERATION_TIME_BUDGET_MS, сигнал обрывает запросы к LLM.
 */
export async function generatePresentation(
  input: GeneratePresentationInput,
): Promise<GeneratedPresentation> {
  const { profile, llm, signal } = input;
  if (profile.layouts.length === 0) throw new Error('В профиле шаблона нет макетов');
  const usage = new LlmUsage();
  const startedAt = performance.now();
  const lap = (() => {
    let last = startedAt;
    return () => {
      const now = performance.now();
      const ms = now - last;
      last = now;
      return Math.round(ms);
    };
  })();

  const progress = input.onProgress ?? (() => {});
  progress({ stage: 'plan' });
  const plan = await planPresentation({
    llm,
    profile,
    brief: input.brief,
    digest: buildDigest(input.sources ?? []),
    durationMinutes: input.durationMinutes,
    usage,
    signal,
  });
  const planMs = lap();

  let previous: Layout | undefined;
  const layouts = plan.slides.map((planned) => {
    previous = selectLayout(profile.layouts, planned.kind, planned.points.length, previous?.id);
    return previous;
  });
  const durations = allocateDurations(layouts, input.durationMinutes);
  let composedCount = 0;
  progress({ stage: 'compose', done: 0, total: plan.slides.length });

  const composed: ComposedSlide[] = await Promise.all(
    plan.slides.map((planned, index) =>
      composeSlide({
        llm,
        layout: layouts[index],
        planned,
        deckTitle: plan.title,
        position: { index, total: plan.slides.length },
        durationSeconds: durations[index],
        tone: profile.tone,
        brief: input.brief,
        usage,
        signal,
      })
        .catch((error: Error) => {
          if (signal?.aborted) throw error;
          return fallbackSlide(layouts[index], planned, error.message);
        })
        .finally(() =>
          progress({ stage: 'compose', done: ++composedCount, total: plan.slides.length }),
        ),
    ),
  );
  const composeMs = lap();

  const slides: Slide[] = composed.map((c, index) => {
    const layout = layouts[index];
    return {
      index,
      layoutId: layout.id,
      kind: layout.kind,
      renderMode: 'native',
      title: c.texts.get('title')?.join(' ') ?? plan.slides[index].goal,
      blocks: layout.slots.map((slot) => ({
        key: slot.key,
        paragraphs: c.texts.get(slot.key) ?? [],
      })),
      speakerNotes: c.speakerNotes,
      durationSeconds: durations[index],
      warnings: c.warnings,
    };
  });
  const fitMs = lap();

  const fills: SlideFill[] = composed.map((c, index) => {
    const layout = layouts[index];
    return {
      sourceSlide: layout.sourceSlide,
      notes: c.speakerNotes,
      fills: new Map(
        layout.slots.map((slot) => [
          slot.shapeId,
          {
            paragraphs: c.texts.get(slot.key) ?? [],
            baseSizePt: slot.fontSizePt,
            fontScale: c.fontScales.get(slot.key) ?? 1,
          },
        ]),
      ),
    };
  });
  progress({ stage: 'render' });
  const pptx = await renderNative(input.template, fills);
  const renderMs = lap();

  return {
    title: plan.title,
    slides,
    pptx,
    script: buildScript(plan.title, slides),
    stats: {
      model: llm.model,
      totalMs: Math.round(performance.now() - startedAt),
      stages: { planMs, composeMs, fitMs, renderMs },
      llm: {
        requests: usage.requests,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    },
  };
}

/** Время выступления делится по слайдам: титул, разделители и финал короче содержательных. */
function allocateDurations(layouts: Layout[], durationMinutes?: number): number[] {
  const total = (durationMinutes ?? (targetSlideCount() * 40) / 60) * 60;
  const weights = layouts.map((l) => (SHORT_KINDS.has(l.kind) ? 0.5 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.max(5, Math.round((total * w) / sum)));
}

function buildScript(title: string, slides: Slide[]): string {
  const body = slides
    .map((s) => `## ${s.index + 1}. ${s.title} (~${s.durationSeconds} с)\n\n${s.speakerNotes}`)
    .join('\n\n');
  return `# ${title}\n\n${body}\n`;
}
