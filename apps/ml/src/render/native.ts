import type { Document, Element } from '@xmldom/xmldom';
import { PptxPackage, relativeTarget, relsPathOf } from '../pptx/package.js';
import {
  attr,
  child,
  children,
  CONTENT_TYPE,
  descendants,
  NS,
  parseXml,
  path,
  REL_TYPE,
  serializeXml,
} from '../pptx/xml.js';

export interface ShapeFill {
  paragraphs: string[];
  /** Кегль из профиля (эффективный, с учётом autofit шаблона). */
  baseSizePt: number;
  /** < 1, если текст пришлось ужать, чтобы влез. */
  fontScale: number;
}

export interface SlideFill {
  /** Номер слайда-образца в шаблоне, с 1. */
  sourceSlide: number;
  fills: Map<string, ShapeFill>;
  notes?: string;
}

/** Связи, которые нельзя тащить в клон: заметки пересоздаём, комментарии и переходы на слайды шаблона — мусор. */
const DROPPED_RELS = new Set<string>([REL_TYPE.notesSlide, REL_TYPE.comments, REL_TYPE.slide]);
const CYRILLIC = /[а-яё]/i;

/**
 * Template-native рендер: берём сам шаблон, клонируем слайды-образцы и меняем только текст.
 * Мастера, макеты, картинки, декор и стили остаются оригинальными.
 */
export async function renderNative(template: Uint8Array, slides: SlideFill[]): Promise<Uint8Array> {
  const pkg = await PptxPackage.load(template);
  const presPath = 'ppt/presentation.xml';
  const presDoc = await pkg.xml(presPath);
  const presRelsDoc = await pkg.xml(relsPathOf(presPath));
  const typesDoc = await pkg.xml('[Content_Types].xml');

  const presRels = await pkg.rels(presPath);
  const sldIdLst = child(presDoc.documentElement!, NS.p, 'sldIdLst')!;
  const originals = children(sldIdLst, NS.p, 'sldId').map((el) => {
    const rId = el.getAttributeNS(NS.r, 'id')!;
    return { el, rId, path: pkg.resolve(presPath, presRels.find((r) => r.id === rId)!.target) };
  });
  const notesMasterRel = presRels.find((r) => r.type === REL_TYPE.notesMaster);
  const notesMasterPath = notesMasterRel && pkg.resolve(presPath, notesMasterRel.target);

  let slideNo = maxIndex(pkg.paths('ppt/slides/'), /slide(\d+)\.xml$/);
  let notesNo = maxIndex(pkg.paths('ppt/notesSlides/'), /notesSlide(\d+)\.xml$/);
  let sldId = Math.max(255, ...originals.map((o) => Number(attr(o.el, 'id'))));

  for (const [i, slide] of slides.entries()) {
    const source = originals[slide.sourceSlide - 1];
    if (!source) throw new Error(`Template has no slide #${slide.sourceSlide}`);
    const newPath = `ppt/slides/slide${++slideNo}.xml`;

    const doc = parseXml(serializeXml(await pkg.xml(source.path)));
    const root = doc.documentElement!;
    // анимации ссылаются на id фигур; после правок они ломают файл (известная проблема pptx-automizer)
    for (const timing of children(root, NS.p, 'timing')) root.removeChild(timing);
    for (const [shapeId, fill] of slide.fills) {
      const sp = findShape(root, shapeId);
      if (sp) fillShape(doc, sp, fill);
    }

    const rels = (await pkg.rels(source.path)).filter((r) => !DROPPED_RELS.has(r.type));
    dropDanglingLinks(
      root,
      rels.map((r) => r.id),
    );
    const relEntries = rels.map((r) => ({
      id: r.id,
      type: r.type,
      target: r.external ? r.target : relativeTarget(newPath, pkg.resolve(source.path, r.target)),
      external: r.external,
    }));

    if (slide.notes && notesMasterPath) {
      const notesPath = `ppt/notesSlides/notesSlide${++notesNo}.xml`;
      pkg.setXml(notesPath, parseXml(notesXml(slide.notes)));
      pkg.setXml(
        relsPathOf(notesPath),
        parseXml(
          relsXml([
            {
              id: 'rId1',
              type: REL_TYPE.notesMaster,
              target: relativeTarget(notesPath, notesMasterPath),
            },
            { id: 'rId2', type: REL_TYPE.slide, target: relativeTarget(notesPath, newPath) },
          ]),
        ),
      );
      addOverride(typesDoc, notesPath, CONTENT_TYPE.notesSlide);
      relEntries.push({
        id: 'rIdPmNotes',
        type: REL_TYPE.notesSlide,
        target: relativeTarget(newPath, notesPath),
        external: false,
      });
    }

    pkg.setXml(newPath, doc);
    pkg.setXml(relsPathOf(newPath), parseXml(relsXml(relEntries)));
    addOverride(typesDoc, newPath, CONTENT_TYPE.slide);

    const rId = `rIdPm${i + 1}`;
    appendRel(presRelsDoc, {
      id: rId,
      type: REL_TYPE.slide,
      target: relativeTarget(presPath, newPath),
    });
    const idEl = presDoc.createElementNS(NS.p, 'p:sldId');
    idEl.setAttribute('id', String(++sldId));
    idEl.setAttributeNS(NS.r, 'r:id', rId);
    sldIdLst.appendChild(idEl);
  }

  for (const original of originals) await removeSlide(pkg, presRelsDoc, typesDoc, original);
  removeSlideReferences(presDoc);
  await updateAppProps(pkg, slides.length);
  return pkg.save();
}

function findShape(root: Element, shapeId: string): Element | undefined {
  return descendants(root, NS.p, 'sp').find(
    (sp) => attr(path(sp, [NS.p, 'nvSpPr'], [NS.p, 'cNvPr']), 'id') === shapeId,
  );
}

/**
 * Замена текста поабзацно: форматирование берём из первого абзаца-образца (pPr — маркеры и отступы,
 * rPr — шрифт и цвет). Замена одной строкой с переносами теряет маркеры — проверено на pptx-automizer.
 */
function fillShape(doc: Document, sp: Element, fill: ShapeFill) {
  const txBody = child(sp, NS.p, 'txBody');
  if (!txBody) return;
  const paragraphs = children(txBody, NS.a, 'p');
  const proto =
    paragraphs.find((p) => descendants(p, NS.a, 't').some((t) => t.textContent)) ?? paragraphs[0];
  const protoPPr = child(proto, NS.a, 'pPr');
  const protoRPr = path(proto, [NS.a, 'r'], [NS.a, 'rPr']) ?? child(proto, NS.a, 'endParaRPr');
  const protoEnd = child(proto, NS.a, 'endParaRPr');
  for (const p of paragraphs) txBody.removeChild(p);

  // старый autofit посчитан под старый текст: кегль выставляем явно
  const bodyPr = child(txBody, NS.a, 'bodyPr');
  const normAutofit = child(bodyPr, NS.a, 'normAutofit');
  const hadScale = normAutofit?.hasAttribute('fontScale') ?? false;
  normAutofit?.removeAttribute('fontScale');
  normAutofit?.removeAttribute('lnSpcReduction');
  const explicitSize =
    hadScale || fill.fontScale < 1 ? Math.round(fill.baseSizePt * fill.fontScale * 100) : undefined;

  const texts = fill.paragraphs.length > 0 ? fill.paragraphs : [''];
  for (const text of texts) {
    const p = doc.createElementNS(NS.a, 'a:p');
    if (protoPPr) p.appendChild(protoPPr.cloneNode(true));
    if (text) {
      const r = doc.createElementNS(NS.a, 'a:r');
      const rPr = doc.createElementNS(NS.a, 'a:rPr');
      if (protoRPr) {
        for (const a of Array.from(protoRPr.attributes)) rPr.setAttribute(a.name, a.value);
        for (let n = protoRPr.firstChild; n; n = n.nextSibling) rPr.appendChild(n.cloneNode(true));
      }
      if (explicitSize) rPr.setAttribute('sz', String(explicitSize));
      if (CYRILLIC.test(text)) rPr.setAttribute('lang', 'ru-RU');
      rPr.removeAttribute('dirty');
      const t = doc.createElementNS(NS.a, 'a:t');
      t.appendChild(doc.createTextNode(text));
      r.appendChild(rPr);
      r.appendChild(t);
      p.appendChild(r);
    }
    if (protoEnd) p.appendChild(protoEnd.cloneNode(true));
    txBody.appendChild(p);
  }
}

/** Гиперссылки на связи, которые мы выкинули (переходы на другие слайды шаблона), удаляем. */
function dropDanglingLinks(root: Element, keptIds: string[]) {
  const kept = new Set(keptIds);
  for (const local of ['hlinkClick', 'hlinkHover']) {
    for (const link of descendants(root, NS.a, local)) {
      const id = link.getAttributeNS(NS.r, 'id');
      if (id && !kept.has(id)) link.parentNode?.removeChild(link);
    }
  }
}

async function removeSlide(
  pkg: PptxPackage,
  presRelsDoc: Document,
  typesDoc: Document,
  slide: { el: Element; rId: string; path: string },
) {
  slide.el.parentNode?.removeChild(slide.el);
  for (const rel of children(presRelsDoc.documentElement!, NS.rels, 'Relationship')) {
    if (attr(rel, 'Id') === slide.rId) presRelsDoc.documentElement!.removeChild(rel);
  }
  for (const rel of await pkg.rels(slide.path)) {
    if (rel.type !== REL_TYPE.notesSlide) continue;
    const notesPath = pkg.resolve(slide.path, rel.target);
    pkg.remove(notesPath);
    pkg.remove(relsPathOf(notesPath));
    removeOverride(typesDoc, notesPath);
  }
  pkg.remove(slide.path);
  pkg.remove(relsPathOf(slide.path));
  removeOverride(typesDoc, slide.path);
}

/** Секции и произвольные показы ссылаются на id удалённых слайдов — PowerPoint сочтёт файл повреждённым. */
function removeSlideReferences(presDoc: Document) {
  for (const sections of descendants(presDoc, NS.p14, 'sectionLst')) {
    const ext = sections.parentNode as Element | null;
    ext?.parentNode?.removeChild(ext);
  }
  for (const shows of descendants(presDoc, NS.p, 'custShowLst'))
    shows.parentNode?.removeChild(shows);
}

async function updateAppProps(pkg: PptxPackage, slideCount: number) {
  if (!pkg.has('docProps/app.xml')) return;
  const doc = await pkg.xml('docProps/app.xml');
  for (const el of Array.from(doc.getElementsByTagName('Slides')))
    el.textContent = String(slideCount);
}

function addOverride(typesDoc: Document, partPath: string, contentType: string) {
  const el = typesDoc.createElementNS(NS.ct, 'Override');
  el.setAttribute('PartName', `/${partPath}`);
  el.setAttribute('ContentType', contentType);
  typesDoc.documentElement!.appendChild(el);
}

function removeOverride(typesDoc: Document, partPath: string) {
  for (const el of children(typesDoc.documentElement!, NS.ct, 'Override')) {
    if (attr(el, 'PartName') === `/${partPath}`) typesDoc.documentElement!.removeChild(el);
  }
}

function appendRel(doc: Document, rel: { id: string; type: string; target: string }) {
  const el = doc.createElementNS(NS.rels, 'Relationship');
  el.setAttribute('Id', rel.id);
  el.setAttribute('Type', rel.type);
  el.setAttribute('Target', rel.target);
  doc.documentElement!.appendChild(el);
}

function maxIndex(paths: string[], pattern: RegExp): number {
  return Math.max(0, ...paths.map((p) => Number(p.match(pattern)?.[1] ?? 0)));
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function relsXml(
  rels: Array<{ id: string; type: string; target: string; external?: boolean }>,
): string {
  const items = rels
    .map(
      (r) =>
        `<Relationship Id="${r.id}" Type="${r.type}" Target="${escapeXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rels}">${items}</Relationships>`;
}

function notesXml(notes: string): string {
  const paragraphs = notes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<a:p><a:r><a:rPr lang="ru-RU" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`,
    )
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:notes xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs || '<a:p/>'}</p:txBody></p:sp>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
  );
}
