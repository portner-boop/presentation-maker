import type { GenerationStats, Presentation } from '@pm/shared';

/** Простая таблица без зависимостей: колонки выравниваются по самому длинному значению. */
export function table<T>(rows: T[], columns: Record<string, (row: T) => string>): string {
  const headers = Object.keys(columns);
  const cells = rows.map((row) => Object.values(columns).map((get) => get(row)));
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (values: string[]) =>
    values
      .map((v, i) => v.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(headers), ...cells.map(line)].join('\n');
}

export const shortDate = (iso: string) => iso.slice(0, 16).replace('T', ' ');

/** Слайды вместе с текстом спикера, в том виде, в каком их удобно читать перед выступлением. */
export function formatSlides(presentation: Presentation): string {
  if (!presentation.slides?.length) return 'Слайдов пока нет';
  return presentation.slides
    .map((slide) => {
      const lines = [
        `── ${slide.index + 1}. ${slide.title}  [${slide.kind}, ~${slide.durationSeconds} с]`,
      ];
      for (const block of slide.blocks) {
        if (block.key === 'title') continue;
        lines.push(...block.paragraphs.map((p) => `   • ${p}`));
      }
      lines.push(`   🎤 ${slide.speakerNotes}`);
      lines.push(...slide.warnings.map((w) => `   ⚠ ${w}`));
      return lines.join('\n');
    })
    .join('\n\n');
}

export function formatStats(stats: GenerationStats): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const { stages, llm } = stats;
  return (
    `${s(stats.totalMs)} (план ${s(stages.planMs)}, слайды ${s(stages.composeMs)}, рендер ${s(stages.renderMs)}), ` +
    `${stats.model}: ${llm.requests} запросов, ${llm.inputTokens}+${llm.outputTokens} токенов`
  );
}
