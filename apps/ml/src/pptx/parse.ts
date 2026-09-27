import type { Element } from '@xmldom/xmldom';
import type { PptxPackage } from './package.js';
import {
  attr,
  child,
  children,
  descendants,
  elementChildren,
  NS,
  numAttr,
  path,
  REL_TYPE,
} from './xml.js';

export const EMU_PER_PT = 12_700;

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Paragraph {
  text: string;
  level: number;
  bullet: boolean;
  sizePt: number;
  typeface?: string;
}

export interface ShapeInfo {
  id: string;
  name: string;
  kind: 'text' | 'picture' | 'graphic' | 'shape';
  placeholder?: { type: string; idx?: string };
  bounds?: Bounds;
  paragraphs: Paragraph[];
  text: string;
  /** Максимальный эффективный кегль в фигуре, с учётом normAutofit fontScale. */
  sizePt: number;
  /** spAutoFit: фигура растёт вместе с текстом, её высота не предел. */
  autoGrow: boolean;
  insets: { l: number; r: number; t: number; b: number };
  lineSpacing: number;
  colors: string[];
}

export interface SlideInfo {
  index: number;
  path: string;
  shapes: ShapeInfo[];
}

export interface ThemeInfo {
  colors: Record<string, string>;
  fonts: { major: string; minor: string };
}

export interface PresentationInfo {
  slideSize: { cx: number; cy: number };
  theme: ThemeInfo;
  slides: SlideInfo[];
  hasNotesMaster: boolean;
}

interface PlaceholderContext {
  byIdx: Map<string, Element>;
  byType: Map<string, Element>;
}

interface MasterContext extends PlaceholderContext {
  txStyles: { title?: Element; body?: Element; other?: Element };
}

const TEXT_PLACEHOLDERS = new Set(['title', 'ctrTitle', 'subTitle', 'body', 'obj']);
const DEFAULT_INSETS = { l: 91_440, r: 91_440, t: 45_720, b: 45_720 };

/** Разбирает презентацию в дерево фигур с разрешённым наследованием слайд → макет → мастер → тема. */
export async function parsePresentation(pkg: PptxPackage): Promise<PresentationInfo> {
  const presPath = 'ppt/presentation.xml';
  const pres = (await pkg.xml(presPath)).documentElement!;
  const sldSz = child(pres, NS.p, 'sldSz');
  const slideSize = {
    cx: numAttr(sldSz, 'cx') ?? 12_192_000,
    cy: numAttr(sldSz, 'cy') ?? 6_858_000,
  };
  const defaultTextStyle = child(pres, NS.p, 'defaultTextStyle');

  const presRels = await pkg.rels(presPath);
  const relById = new Map(presRels.map((r) => [r.id, r]));
  const slidePaths = children(child(pres, NS.p, 'sldIdLst') ?? pres, NS.p, 'sldId').flatMap(
    (el) => {
      const rel = relById.get(el.getAttributeNS(NS.r, 'id') ?? '');
      return rel ? [pkg.resolve(presPath, rel.target)] : [];
    },
  );

  const layouts = new Map<string, PlaceholderContext & { masterPath: string }>();
  const masters = new Map<string, MasterContext & { themePath?: string }>();

  async function masterContext(masterPath: string) {
    let ctx = masters.get(masterPath);
    if (!ctx) {
      const root = (await pkg.xml(masterPath)).documentElement!;
      const txStyles = child(root, NS.p, 'txStyles');
      const theme = (await pkg.rels(masterPath)).find((r) => r.type === REL_TYPE.theme);
      ctx = {
        ...placeholderContext(root),
        txStyles: {
          title: child(txStyles, NS.p, 'titleStyle'),
          body: child(txStyles, NS.p, 'bodyStyle'),
          other: child(txStyles, NS.p, 'otherStyle'),
        },
        themePath: theme && pkg.resolve(masterPath, theme.target),
      };
      masters.set(masterPath, ctx);
    }
    return ctx;
  }

  async function layoutContext(layoutPath: string) {
    let ctx = layouts.get(layoutPath);
    if (!ctx) {
      const root = (await pkg.xml(layoutPath)).documentElement!;
      const master = (await pkg.rels(layoutPath)).find((r) => r.type === REL_TYPE.slideMaster);
      ctx = { ...placeholderContext(root), masterPath: pkg.resolve(layoutPath, master!.target) };
      layouts.set(layoutPath, ctx);
    }
    return ctx;
  }

  const slides: SlideInfo[] = [];
  let theme: ThemeInfo = { colors: {}, fonts: { major: 'Calibri', minor: 'Calibri' } };

  for (const [i, slidePath] of slidePaths.entries()) {
    const layoutRel = (await pkg.rels(slidePath)).find((r) => r.type === REL_TYPE.slideLayout);
    const layout = layoutRel
      ? await layoutContext(pkg.resolve(slidePath, layoutRel.target))
      : undefined;
    const master = layout ? await masterContext(layout.masterPath) : undefined;
    if (i === 0 && master?.themePath)
      theme = parseTheme((await pkg.xml(master.themePath)).documentElement!);

    const spTree = path(
      (await pkg.xml(slidePath)).documentElement!,
      [NS.p, 'cSld'],
      [NS.p, 'spTree'],
    );
    const shapes: ShapeInfo[] = [];
    if (spTree) {
      walkTree(spTree, identity, (el, transform) => {
        const shape = parseShape(el, transform, { layout, master, defaultTextStyle, theme });
        if (shape) shapes.push(shape);
      });
    }
    slides.push({ index: i + 1, path: slidePath, shapes });
  }

  return {
    slideSize,
    theme,
    slides,
    hasNotesMaster: presRels.some((r) => r.type === REL_TYPE.notesMaster),
  };
}

function placeholderContext(root: Element): PlaceholderContext {
  const byIdx = new Map<string, Element>();
  const byType = new Map<string, Element>();
  for (const sp of descendants(root, NS.p, 'sp')) {
    const ph = path(sp, [NS.p, 'nvSpPr'], [NS.p, 'nvPr'], [NS.p, 'ph']);
    if (!ph) continue;
    const idx = attr(ph, 'idx');
    const type = attr(ph, 'type') ?? 'obj';
    if (idx !== undefined && !byIdx.has(idx)) byIdx.set(idx, sp);
    if (!byType.has(type)) byType.set(type, sp);
  }
  return { byIdx, byType };
}

const TYPE_FALLBACKS: Record<string, string[]> = {
  ctrTitle: ['ctrTitle', 'title'],
  title: ['title', 'ctrTitle'],
  subTitle: ['subTitle', 'body', 'obj'],
  obj: ['obj', 'body'],
  body: ['body', 'obj'],
};

function findPlaceholder(ctx: PlaceholderContext | undefined, ph: { type: string; idx?: string }) {
  if (!ctx) return undefined;
  if (ph.idx !== undefined && ph.type !== 'title' && ph.type !== 'ctrTitle') {
    const byIdx = ctx.byIdx.get(ph.idx);
    if (byIdx) return byIdx;
  }
  for (const type of TYPE_FALLBACKS[ph.type] ?? [ph.type]) {
    const byType = ctx.byType.get(type);
    if (byType) return byType;
  }
  return undefined;
}

type Transform = (b: Bounds) => Bounds;
const identity: Transform = (b) => b;

/** Обходит spTree, пересчитывая координаты вложенных групп (chOff/chExt) в координаты слайда. */
function walkTree(tree: Element, transform: Transform, visit: (el: Element, t: Transform) => void) {
  for (const el of elementChildren(tree)) {
    if (el.namespaceURI !== NS.p) continue;
    if (el.localName === 'grpSp') {
      const xfrm = path(el, [NS.p, 'grpSpPr'], [NS.a, 'xfrm']);
      const off = point(child(xfrm, NS.a, 'off'), 'x', 'y');
      const ext = point(child(xfrm, NS.a, 'ext'), 'cx', 'cy');
      const chOff = point(child(xfrm, NS.a, 'chOff'), 'x', 'y');
      const chExt = point(child(xfrm, NS.a, 'chExt'), 'cx', 'cy');
      const sx = chExt[0] ? ext[0] / chExt[0] : 1;
      const sy = chExt[1] ? ext[1] / chExt[1] : 1;
      const inner: Transform = (b) =>
        transform({
          x: off[0] + (b.x - chOff[0]) * sx,
          y: off[1] + (b.y - chOff[1]) * sy,
          w: b.w * sx,
          h: b.h * sy,
        });
      walkTree(el, inner, visit);
    } else if (['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(el.localName ?? '')) {
      visit(el, transform);
    }
  }
}

function point(el: Element | undefined, a: string, b: string): [number, number] {
  return [numAttr(el, a) ?? 0, numAttr(el, b) ?? 0];
}

function readXfrm(xfrm: Element | undefined): Bounds | undefined {
  const off = child(xfrm, NS.a, 'off');
  const ext = child(xfrm, NS.a, 'ext');
  if (!off || !ext) return undefined;
  return {
    x: numAttr(off, 'x') ?? 0,
    y: numAttr(off, 'y') ?? 0,
    w: numAttr(ext, 'cx') ?? 0,
    h: numAttr(ext, 'cy') ?? 0,
  };
}

interface ShapeContext {
  layout?: PlaceholderContext;
  master?: MasterContext;
  defaultTextStyle?: Element;
  theme: ThemeInfo;
}

function parseShape(el: Element, transform: Transform, ctx: ShapeContext): ShapeInfo | undefined {
  const local = el.localName;
  const nv = child(
    el,
    NS.p,
    local === 'sp'
      ? 'nvSpPr'
      : local === 'pic'
        ? 'nvPicPr'
        : local === 'graphicFrame'
          ? 'nvGraphicFramePr'
          : 'nvCxnSpPr',
  );
  const cNvPr = child(nv, NS.p, 'cNvPr');
  const phEl = path(nv, [NS.p, 'nvPr'], [NS.p, 'ph']);
  const placeholder = phEl
    ? { type: attr(phEl, 'type') ?? 'obj', idx: attr(phEl, 'idx') }
    : undefined;

  const layoutPh = placeholder ? findPlaceholder(ctx.layout, placeholder) : undefined;
  const masterPlaceholder = layoutPh ? (phOf(layoutPh) ?? placeholder) : placeholder;
  const masterPh = masterPlaceholder ? findPlaceholder(ctx.master, masterPlaceholder) : undefined;
  const chain = [el, layoutPh, masterPh];

  const xfrmOf = (shape: Element | undefined) =>
    shape &&
    (shape.localName === 'graphicFrame'
      ? child(shape, NS.p, 'xfrm')
      : path(shape, [NS.p, 'spPr'], [NS.a, 'xfrm']));
  const raw = chain.map(xfrmOf).map(readXfrm).find(Boolean);
  const bounds = raw && transform(raw);

  const base = {
    id: attr(cNvPr, 'id') ?? '',
    name: attr(cNvPr, 'name') ?? '',
    placeholder,
    bounds,
    paragraphs: [] as Paragraph[],
    text: '',
    sizePt: 0,
    autoGrow: false,
    insets: DEFAULT_INSETS,
    lineSpacing: 1,
    colors: descendants(el, NS.a, 'srgbClr').map((c) => `#${(attr(c, 'val') ?? '').toUpperCase()}`),
  };

  if (local === 'pic') return { ...base, kind: 'picture' };
  if (local === 'graphicFrame') return { ...base, kind: 'graphic' };
  if (local === 'cxnSp') return { ...base, kind: 'shape' };

  const txBody = child(el, NS.p, 'txBody');
  const bodyPrs = chain.map((shape) => path(shape, [NS.p, 'txBody'], [NS.a, 'bodyPr']));
  const insets = {
    l: firstNum(bodyPrs, 'lIns') ?? DEFAULT_INSETS.l,
    r: firstNum(bodyPrs, 'rIns') ?? DEFAULT_INSETS.r,
    t: firstNum(bodyPrs, 'tIns') ?? DEFAULT_INSETS.t,
    b: firstNum(bodyPrs, 'bIns') ?? DEFAULT_INSETS.b,
  };
  const ownBodyPr = bodyPrs[0];
  const normAutofit = bodyPrs.map((b) => child(b, NS.a, 'normAutofit')).find(Boolean);
  const fontScale =
    (numAttr(child(ownBodyPr, NS.a, 'normAutofit'), 'fontScale') ?? 100_000) / 100_000;
  const autoGrow = bodyPrs.some((b) => child(b, NS.a, 'spAutoFit')) && !normAutofit;

  const phType = placeholder?.type;
  const txStyle = !placeholder
    ? ctx.master?.txStyles.other
    : phType === 'title' || phType === 'ctrTitle'
      ? ctx.master?.txStyles.title
      : ctx.master?.txStyles.body;
  const lists = [
    ...chain.map((shape) => path(shape, [NS.p, 'txBody'], [NS.a, 'lstStyle'])),
    ...(placeholder ? [txStyle, ctx.defaultTextStyle] : [ctx.defaultTextStyle, txStyle]),
  ];

  const paragraphs: Paragraph[] = children(txBody ?? el, NS.a, 'p').map((p) => {
    const pPr = child(p, NS.a, 'pPr');
    const level = numAttr(pPr, 'lvl') ?? 0;
    const runs = [...children(p, NS.a, 'r'), ...children(p, NS.a, 'fld')];
    const text = children(p, NS.a, 'r')
      .concat(children(p, NS.a, 'fld'))
      .map((r) => child(r, NS.a, 't')?.textContent ?? '')
      .join('');
    const runSize = runs
      .map((r) => numAttr(child(r, NS.a, 'rPr'), 'sz'))
      .find((v) => v !== undefined);
    const size =
      runSize ??
      numAttr(child(p, NS.a, 'endParaRPr'), 'sz') ??
      levelProp(lists, level, (lvl) => numAttr(child(lvl, NS.a, 'defRPr'), 'sz')) ??
      1_800;
    const ownBullet = pPr ? bulletOf(pPr) : undefined;
    const bullet = ownBullet ?? levelProp(lists, level, bulletOf) ?? false;
    const typeface = runs
      .map((r) => attr(path(r, [NS.a, 'rPr'], [NS.a, 'latin']), 'typeface'))
      .find(Boolean);
    return {
      text,
      level,
      bullet,
      sizePt: (size / 100) * fontScale,
      typeface: typeface && resolveTypeface(typeface, ctx.theme),
    };
  });

  const text = paragraphs
    .map((p) => p.text)
    .join('\n')
    .trim();
  const lnSpc =
    paragraphs.length > 0
      ? (numAttr(
          path(
            child(children(txBody ?? el, NS.a, 'p')[0], NS.a, 'pPr'),
            [NS.a, 'lnSpc'],
            [NS.a, 'spcPct'],
          ),
          'val',
        ) ??
        levelProp(lists, 0, (lvl) => numAttr(path(lvl, [NS.a, 'lnSpc'], [NS.a, 'spcPct']), 'val')))
      : undefined;

  const isTextPlaceholder = placeholder !== undefined && TEXT_PLACEHOLDERS.has(placeholder.type);
  const hasBlip = path(el, [NS.p, 'spPr'], [NS.a, 'blipFill']) !== undefined;
  const kind = text || isTextPlaceholder ? 'text' : hasBlip ? 'picture' : 'shape';

  return {
    ...base,
    kind,
    paragraphs,
    text,
    sizePt: Math.max(0, ...paragraphs.map((p) => p.sizePt)),
    autoGrow,
    insets,
    lineSpacing: (lnSpc ?? 100_000) / 100_000,
  };
}

function phOf(sp: Element) {
  const ph = path(sp, [NS.p, 'nvSpPr'], [NS.p, 'nvPr'], [NS.p, 'ph']);
  return ph ? { type: attr(ph, 'type') ?? 'obj', idx: attr(ph, 'idx') } : undefined;
}

function firstNum(elements: Array<Element | undefined>, name: string): number | undefined {
  for (const el of elements) {
    const value = numAttr(el, name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function levelProp<T>(
  lists: Array<Element | undefined>,
  level: number,
  pick: (lvl: Element) => T | undefined,
): T | undefined {
  for (const list of lists) {
    const lvl = child(list, NS.a, `lvl${level + 1}pPr`);
    const value = lvl && pick(lvl);
    if (value !== undefined) return value;
  }
  return undefined;
}

function bulletOf(pPr: Element): boolean | undefined {
  if (child(pPr, NS.a, 'buNone')) return false;
  if (child(pPr, NS.a, 'buChar') || child(pPr, NS.a, 'buAutoNum') || child(pPr, NS.a, 'buBlip')) {
    return true;
  }
  return undefined;
}

function resolveTypeface(typeface: string, theme: ThemeInfo): string {
  if (typeface.startsWith('+mj')) return theme.fonts.major;
  if (typeface.startsWith('+mn')) return theme.fonts.minor;
  return typeface;
}

function parseTheme(root: Element): ThemeInfo {
  const elements = child(root, NS.a, 'themeElements');
  const colors: Record<string, string> = {};
  for (const el of elementChildren(child(elements, NS.a, 'clrScheme') ?? root)) {
    const srgb = child(el, NS.a, 'srgbClr');
    const sys = child(el, NS.a, 'sysClr');
    const value = attr(srgb, 'val') ?? attr(sys, 'lastClr');
    if (value && el.localName) colors[el.localName] = `#${value.toUpperCase()}`;
  }
  const fontScheme = child(elements, NS.a, 'fontScheme');
  return {
    colors,
    fonts: {
      major: attr(path(fontScheme, [NS.a, 'majorFont'], [NS.a, 'latin']), 'typeface') ?? 'Calibri',
      minor: attr(path(fontScheme, [NS.a, 'minorFont'], [NS.a, 'latin']), 'typeface') ?? 'Calibri',
    },
  };
}
