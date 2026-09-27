import type { Layout, LayoutKind, Slot, SlotRole } from '@pm/shared';
import type { Bounds, PresentationInfo, ShapeInfo, SlideInfo } from '../pptx/parse.js';
import { capacityOf } from './capacity.js';

const FOOTER_PLACEHOLDERS = new Set(['dt', 'ftr', 'sldNum', 'hdr']);
const MAX_LINES = { title: 3, subtitle: 3, 'item-title': 2 } as Partial<Record<SlotRole, number>>;

interface Group {
  heading?: ShapeInfo;
  text: ShapeInfo;
}

export interface LayoutLibrary {
  layouts: Layout[];
  warnings: string[];
  /** Какие фигуры считаются заголовками/текстом — нужно для оценки шрифтов бренда. */
  titleShapes: ShapeInfo[];
  bodyShapes: ShapeInfo[];
}

/**
 * Превращает слайды шаблона в библиотеку макетов: роли текстовых полей, группы «заголовок + текст»,
 * вместимость каждого поля. Одинаковые по структуре слайды схлопываются в один макет.
 */
export function buildLayoutLibrary(info: PresentationInfo): LayoutLibrary {
  const warnings: string[] = [];
  const staticTexts = findStaticTexts(info);
  const layouts: Layout[] = [];
  const signatures = new Set<string>();
  const titleShapes: ShapeInfo[] = [];
  const bodyShapes: ShapeInfo[] = [];

  for (const slide of info.slides) {
    if (slide.shapes.some((s) => s.kind === 'graphic')) {
      warnings.push(
        `Слайд ${slide.index}: диаграмма/таблица/SmartArt — пока не используется как макет`,
      );
      continue;
    }
    const layout = analyzeSlide(slide, info, staticTexts);
    if (!layout) {
      warnings.push(`Слайд ${slide.index}: нет текстовых полей для заполнения`);
      continue;
    }
    for (const slot of layout.slots) {
      const shape = slide.shapes.find((s) => s.id === slot.shapeId)!;
      (slot.role === 'title' || slot.role === 'item-title' ? titleShapes : bodyShapes).push(shape);
    }
    const signature = `${layout.kind}|${layout.hasImage}|${layout.slots.map((s) => s.key).join(',')}`;
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    layouts.push(layout);
  }

  if (layouts.length === 0)
    warnings.push('В шаблоне не нашлось ни одного пригодного слайда-образца');
  return { layouts, warnings, titleShapes, bodyShapes };
}

/** Тексты, которые повторяются на многих слайдах (логотип, футер, название события), — часть бренда. */
function findStaticTexts(info: PresentationInfo): Set<string> {
  const counts = new Map<string, number>();
  for (const slide of info.slides) {
    const seen = new Set(slide.shapes.filter((s) => s.text).map((s) => normalize(s.text)));
    for (const text of seen) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(info.slides.length * 0.5));
  return new Set(
    info.slides.length >= 3 ? [...counts].filter(([, n]) => n >= threshold).map(([t]) => t) : [],
  );
}

function analyzeSlide(
  slide: SlideInfo,
  info: PresentationInfo,
  staticTexts: Set<string>,
): Layout | undefined {
  const { cx: slideW, cy: slideH } = info.slideSize;
  const hasRealText = slide.shapes.some((s) => s.kind === 'text' && s.text);
  const candidates = slide.shapes.filter((s) => {
    if (s.kind !== 'text' || !s.bounds) return false;
    if (s.placeholder && FOOTER_PLACEHOLDERS.has(s.placeholder.type)) return false;
    // пустой плейсхолдер мастера на слайде с реальным текстом дизайнер не использовал
    if (!s.text && s.placeholder && hasRealText) return false;
    if (s.text && staticTexts.has(normalize(s.text))) return false;
    if (/^\s*[\d/.\-–]{1,5}\s*$/.test(s.text)) return false; // номера страниц и счётчики
    const isEdge = s.bounds.y > slideH * 0.9 || s.bounds.y + s.bounds.h < slideH * 0.1;
    return !(isEdge && s.sizePt > 0 && s.sizePt < 11);
  });
  if (candidates.length === 0) return undefined;

  const bigPicture = slide.shapes.some((s) => {
    if (s.kind !== 'picture' || !s.bounds) return false;
    const share = (s.bounds.w * s.bounds.h) / (slideW * slideH);
    return share > 0.12 && share < 0.9; // фон и мелкие иконки не в счёт
  });
  const title = pickTitle(candidates, slideH);
  let rest = candidates.filter((s) => s !== title);

  let subtitle = rest.find((s) => s.placeholder?.type === 'subTitle');
  // текст рядом с большой картинкой — это описание, а не подзаголовок
  if (
    !subtitle &&
    title &&
    !bigPicture &&
    rest.length === 1 &&
    !rest[0].paragraphs.some((p) => p.bullet)
  ) {
    const [only] = rest;
    if (wordCount(only.text) <= 15 && only.bounds!.y >= title.bounds!.y) subtitle = only;
  }
  rest = rest.filter((s) => s !== subtitle);

  const groups = sortByReadingOrder(pairHeadings(rest), slideH);

  const isLast = slide.index === info.slides.length;
  let kind: LayoutKind;
  const slots: Slot[] = [];
  const add = (key: string, role: SlotRole, shape: ShapeInfo) =>
    slots.push(makeSlot(key, role, shape, slide, info));

  if (title) add('title', 'title', title);
  if (subtitle) add('subtitle', 'subtitle', subtitle);

  if (groups.length === 0) {
    kind = slide.index === 1 ? 'title' : isLast ? 'closing' : 'section';
  } else if (groups.length === 1) {
    const [group] = groups;
    if (group.heading) add('body_title', 'item-title', group.heading);
    add('body', 'body', group.text);
    const bulleted =
      group.text.paragraphs.some((p) => p.bullet) || group.text.paragraphs.length >= 3;
    kind = bigPicture ? 'image-text' : bulleted ? 'bullets' : 'text';
  } else {
    const sameRow =
      groups.length === 2 &&
      Math.abs(groups[0].text.bounds!.y - groups[1].text.bounds!.y) < slideH * 0.1;
    const names = sameRow ? ['left', 'right'] : groups.map((_, i) => `item${i + 1}`);
    groups.forEach((group, i) => {
      if (group.heading) add(`${names[i]}_title`, 'item-title', group.heading);
      add(names[i], 'item-text', group.text);
    });
    kind = sameRow ? 'two-column' : 'cards';
  }

  return {
    id: `slide-${slide.index}`,
    kind,
    sourceSlide: slide.index,
    items: groups.length,
    hasImage: bigPicture,
    slots,
  };
}

function pickTitle(candidates: ShapeInfo[], slideH: number): ShapeInfo | undefined {
  const byPlaceholder = candidates.find(
    (s) => s.placeholder?.type === 'title' || s.placeholder?.type === 'ctrTitle',
  );
  if (byPlaceholder) return byPlaceholder;
  const sorted = [...candidates].sort((a, b) => b.sizePt - a.sizePt);
  const [largest, second] = sorted;
  const inUpperPart = largest.bounds!.y + largest.bounds!.h / 2 < slideH * 0.6;
  if (!second) return inUpperPart || wordCount(largest.text) <= 10 ? largest : undefined;
  return largest.sizePt >= second.sizePt * 1.15 && inUpperPart ? largest : undefined;
}

/** Короткий крупный текст прямо над другим текстом — заголовок карточки/колонки. */
function pairHeadings(shapes: ShapeInfo[]): Group[] {
  const used = new Set<ShapeInfo>();
  const groups: Group[] = [];
  const sizes = shapes.map((s) => s.sizePt).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;

  for (const heading of shapes) {
    if (used.has(heading) || wordCount(heading.text) > 6) continue;
    const below = shapes
      .filter((s) => s !== heading && !used.has(s) && isBelow(heading.bounds!, s.bounds!))
      .sort((a, b) => a.bounds!.y - b.bounds!.y)[0];
    if (!below || heading.sizePt < Math.max(below.sizePt * 1.05, median * 0.95)) continue;
    used.add(heading).add(below);
    groups.push({ heading, text: below });
  }
  for (const shape of shapes) if (!used.has(shape)) groups.push({ text: shape });
  return groups;
}

function isBelow(top: Bounds, candidate: Bounds): boolean {
  const overlap = Math.min(top.x + top.w, candidate.x + candidate.w) - Math.max(top.x, candidate.x);
  const gap = candidate.y - (top.y + top.h);
  return (
    overlap > Math.min(top.w, candidate.w) * 0.5 &&
    gap > -top.h * 0.3 &&
    gap < Math.max(top.h * 1.5, 400_000)
  );
}

function sortByReadingOrder(groups: Group[], slideH: number): Group[] {
  const anchor = (g: Group) => (g.heading ?? g.text).bounds!;
  return groups.sort((a, b) => {
    const rowA = Math.round(anchor(a).y / (slideH * 0.1));
    const rowB = Math.round(anchor(b).y / (slideH * 0.1));
    return rowA - rowB || anchor(a).x - anchor(b).x;
  });
}

function makeSlot(
  key: string,
  role: SlotRole,
  shape: ShapeInfo,
  slide: SlideInfo,
  info: PresentationInfo,
): Slot {
  const bullets = shape.paragraphs.some((p) => p.bullet);
  const sizePt = shape.sizePt || 18;
  const bounds = shape.bounds!;
  const heightEmu = shape.autoGrow ? growHeight(shape, slide, info) : bounds.h;
  const capacity = capacityOf(shape, { heightEmu, sizePt, bullets });
  const cap = MAX_LINES[role];
  return {
    key,
    shapeId: shape.id,
    role,
    bullets,
    fontSizePt: Math.round(sizePt * 10) / 10,
    charsPerLine: capacity.charsPerLine,
    maxLines: cap ? Math.min(cap, capacity.maxLines) : capacity.maxLines,
    sample: shape.text.slice(0, 300),
  };
}

/** Фигура с spAutoFit растёт вниз: предел — ближайший элемент под ней или низ слайда. */
function growHeight(shape: ShapeInfo, slide: SlideInfo, info: PresentationInfo): number {
  const b = shape.bounds!;
  const bottom = b.y + b.h;
  const obstacles = slide.shapes
    .filter((s) => s !== shape && s.bounds && s.bounds.y >= bottom - 1)
    .filter((s) => Math.min(b.x + b.w, s.bounds!.x + s.bounds!.w) - Math.max(b.x, s.bounds!.x) > 0)
    .map((s) => s.bounds!.y);
  const limit = Math.min(info.slideSize.cy * 0.95, ...obstacles);
  return Math.max(b.h, Math.min(limit - b.y, b.h * 4));
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
