import { EMU_PER_PT, type ShapeInfo } from '../pptx/parse.js';

/**
 * Средняя ширина символа в долях кегля для гротеска (кириллица шире латиницы).
 * Грубая, но стабильная оценка. Точнее — метрики реального шрифта, если он есть в контент-паке.
 */
const CHAR_WIDTH_EM = 0.55;
const LINE_HEIGHT_EM = 1.2;

export interface Capacity {
  charsPerLine: number;
  maxLines: number;
}

export function capacityOf(
  shape: ShapeInfo,
  { heightEmu, sizePt, bullets }: { heightEmu: number; sizePt: number; bullets: boolean },
): Capacity {
  const widthPt = ((shape.bounds?.w ?? 0) - shape.insets.l - shape.insets.r) / EMU_PER_PT;
  const heightPt = (heightEmu - shape.insets.t - shape.insets.b) / EMU_PER_PT;
  const indentPt = bullets ? sizePt * 1.2 : 0;
  const lineHeightPt = sizePt * LINE_HEIGHT_EM * shape.lineSpacing;
  return {
    charsPerLine: Math.max(4, Math.floor((widthPt - indentPt) / (sizePt * CHAR_WIDTH_EM))),
    maxLines: Math.max(1, Math.floor(heightPt / lineHeightPt)),
  };
}

/** Сколько строк займут абзацы при переносе по словам. */
export function linesNeeded(paragraphs: string[], charsPerLine: number): number {
  let lines = 0;
  for (const paragraph of paragraphs) {
    let current = 0;
    let paragraphLines = 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const needed = current === 0 ? word.length : current + 1 + word.length;
      if (needed <= charsPerLine) {
        current = needed;
      } else if (current === 0) {
        // слово длиннее строки: переносится по символам
        paragraphLines += Math.ceil(word.length / charsPerLine) - 1;
        current = word.length % charsPerLine;
      } else {
        paragraphLines += 1;
        current = word.length;
      }
    }
    lines += paragraphLines;
  }
  return lines;
}
