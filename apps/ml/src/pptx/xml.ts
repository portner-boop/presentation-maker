import { DOMParser, type Document, type Element, XMLSerializer } from '@xmldom/xmldom';

export const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rels: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
} as const;

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export const REL_TYPE = {
  slide: `${REL}slide`,
  slideLayout: `${REL}slideLayout`,
  slideMaster: `${REL}slideMaster`,
  notesSlide: `${REL}notesSlide`,
  notesMaster: `${REL}notesMaster`,
  theme: `${REL}theme`,
  chart: `${REL}chart`,
  comments: `${REL}comments`,
  hyperlink: `${REL}hyperlink`,
} as const;

export const CONTENT_TYPE = {
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
} as const;

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/xml');
}

export function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

export function children(el: Element, ns: string, local: string): Element[] {
  const result: Element[] = [];
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) {
      const child = node as Element;
      if (child.namespaceURI === ns && child.localName === local) result.push(child);
    }
  }
  return result;
}

export function child(el: Element | undefined, ns: string, local: string): Element | undefined {
  return el ? children(el, ns, local)[0] : undefined;
}

/** Путь по прямым потомкам: path(sp, [NS.p, 'nvSpPr'], [NS.p, 'nvPr'], [NS.p, 'ph']). */
export function path(
  el: Element | undefined,
  ...steps: Array<[string, string]>
): Element | undefined {
  let current = el;
  for (const [ns, local] of steps) current = child(current, ns, local);
  return current;
}

export function descendants(el: Element | Document, ns: string, local: string): Element[] {
  return Array.from(el.getElementsByTagNameNS(ns, local));
}

export function elementChildren(el: Element): Element[] {
  const result: Element[] = [];
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) result.push(node as Element);
  }
  return result;
}

export function attr(el: Element | undefined, name: string): string | undefined {
  if (!el || !el.hasAttribute(name)) return undefined;
  return el.getAttribute(name) ?? undefined;
}

export function numAttr(el: Element | undefined, name: string): number | undefined {
  const value = attr(el, name);
  return value === undefined ? undefined : Number(value);
}
