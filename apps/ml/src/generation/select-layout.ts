import type { Layout, LayoutKind } from '@pm/shared';

const FALLBACKS: Record<LayoutKind, LayoutKind[]> = {
  title: ['section', 'text', 'bullets'],
  section: ['title', 'text', 'bullets'],
  closing: ['section', 'title', 'text'],
  bullets: ['text', 'cards', 'two-column'],
  text: ['bullets', 'section'],
  'two-column': ['cards', 'bullets'],
  cards: ['two-column', 'bullets'],
  'image-text': ['bullets', 'text'],
  other: ['bullets', 'text'],
};

/**
 * Выбор конкретного макета — детерминированный код, не LLM: тип композиции, число пунктов,
 * без повтора одного и того же макета подряд.
 */
export function selectLayout(
  layouts: Layout[],
  kind: LayoutKind,
  points: number,
  previousId?: string,
): Layout {
  for (const k of [kind, ...FALLBACKS[kind]]) {
    const candidates = layouts.filter((l) => l.kind === k);
    if (candidates.length > 0) return best(candidates, points, previousId);
  }
  return best(layouts, points, previousId);
}

function best(candidates: Layout[], points: number, previousId?: string): Layout {
  const score = (l: Layout) =>
    (l.items > 1 ? Math.abs(l.items - points) : 0) +
    (l.id === previousId ? 1.5 : 0) +
    (l.hasImage ? 0.5 : 0); // картинка из шаблона может оказаться чужим контентом
  return [...candidates].sort((a, b) => score(a) - score(b))[0];
}
