import type { Slot } from '@pm/shared';
import { linesNeeded } from '../analysis/capacity.js';

/** Насколько можно ужать кегль, прежде чем сокращать текст. */
const FONT_SCALES = [1, 0.92, 0.85];

export interface FitResult {
  fits: boolean;
  fontScale: number;
}

export function fitSlot(slot: Slot, paragraphs: string[]): FitResult {
  for (const scale of FONT_SCALES) {
    const charsPerLine = Math.floor(slot.charsPerLine / scale);
    const maxLines = Math.floor(slot.maxLines / scale);
    if (linesNeeded(paragraphs, charsPerLine) <= maxLines) return { fits: true, fontScale: scale };
  }
  return { fits: false, fontScale: FONT_SCALES.at(-1)! };
}

/**
 * Потолок читаемости: влезть в рамку ≠ читаться с экрана. Слайд — опора для спикера,
 * подробности уходят в текст выступления.
 */
const READABLE_CHARS: Record<Slot['role'], number> = {
  title: 60,
  subtitle: 90,
  body: 280,
  'item-title': 32,
  'item-text': 150,
};
const READABLE_ITEMS = 5;
const READABLE_ITEM_CHARS = 80;

/** Бюджет символов для промпта: с запасом на перенос по словам и не больше потолка читаемости. */
export function charBudget(slot: Slot): number {
  const capacity = Math.floor(slot.charsPerLine * slot.maxLines * 0.85);
  return Math.max(10, Math.min(capacity, READABLE_CHARS[slot.role]));
}

export function maxItems(slot: Slot): number {
  return Math.max(1, Math.min(READABLE_ITEMS, slot.maxLines));
}

export function itemBudget(slot: Slot): number {
  return Math.max(
    12,
    Math.min(
      READABLE_ITEM_CHARS,
      Math.floor((slot.charsPerLine * slot.maxLines * 0.85) / maxItems(slot)),
    ),
  );
}

/** Последний рубеж: выкинуть лишние пункты или обрезать по слову, чтобы не вылезти за рамку. */
export function truncateToFit(slot: Slot, paragraphs: string[]): string[] {
  const result = [...paragraphs];
  const minScale = FONT_SCALES.at(-1)!;
  const charsPerLine = Math.floor(slot.charsPerLine / minScale);
  const maxLines = Math.floor(slot.maxLines / minScale);
  while (result.length > 1 && linesNeeded(result, charsPerLine) > maxLines) result.pop();
  if (linesNeeded(result, charsPerLine) > maxLines) {
    const words = result[0].split(/\s+/);
    while (words.length > 1 && linesNeeded([`${words.join(' ')}…`], charsPerLine) > maxLines)
      words.pop();
    result[0] = `${words.join(' ').replace(/[,.;:—-]+$/, '')}…`;
  }
  return result;
}
