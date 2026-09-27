import { posix } from 'node:path';
import type { Document } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { attr, children, NS, parseXml, serializeXml } from './xml.js';

export interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

/** OPC-пакет (.pptx — это zip с xml-частями и файлами связей). */
export class PptxPackage {
  private readonly docs = new Map<string, Document>();

  private constructor(private readonly zip: JSZip) {}

  static async load(data: Uint8Array): Promise<PptxPackage> {
    return new PptxPackage(await JSZip.loadAsync(data));
  }

  has(partPath: string): boolean {
    return this.zip.file(partPath) !== null;
  }

  paths(prefix: string): string[] {
    return Object.keys(this.zip.files).filter(
      (p) => p.startsWith(prefix) && !this.zip.files[p].dir,
    );
  }

  /** Разобранный xml части. Документы кешируются: правки копятся в памяти до save(). */
  async xml(partPath: string): Promise<Document> {
    const cached = this.docs.get(partPath);
    if (cached) return cached;
    const file = this.zip.file(partPath);
    if (!file) throw new Error(`Part not found in pptx: ${partPath}`);
    const doc = parseXml(await file.async('string'));
    this.docs.set(partPath, doc);
    return doc;
  }

  setXml(partPath: string, doc: Document): void {
    this.docs.set(partPath, doc);
  }

  async copy(from: string, to: string): Promise<void> {
    const file = this.zip.file(from);
    if (!file) throw new Error(`Part not found in pptx: ${from}`);
    this.zip.file(to, await file.async('uint8array'));
  }

  remove(partPath: string): void {
    this.docs.delete(partPath);
    this.zip.remove(partPath);
  }

  async rels(partPath: string): Promise<Relationship[]> {
    const relsPath = relsPathOf(partPath);
    if (!this.has(relsPath) && !this.docs.has(relsPath)) return [];
    const doc = await this.xml(relsPath);
    return children(doc.documentElement!, NS.rels, 'Relationship').map((el) => ({
      id: attr(el, 'Id')!,
      type: attr(el, 'Type')!,
      target: attr(el, 'Target')!,
      external: attr(el, 'TargetMode') === 'External',
    }));
  }

  /** Абсолютный путь части по относительному Target из .rels. */
  resolve(partPath: string, target: string): string {
    if (target.startsWith('/')) return target.slice(1);
    return posix.normalize(posix.join(posix.dirname(partPath), target));
  }

  async save(): Promise<Uint8Array> {
    for (const [partPath, doc] of this.docs) this.zip.file(partPath, serializeXml(doc));
    return this.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
}

export function relsPathOf(partPath: string): string {
  return posix.join(posix.dirname(partPath), '_rels', `${posix.basename(partPath)}.rels`);
}

/** Target для связи from → to, относительно папки from. */
export function relativeTarget(from: string, to: string): string {
  return posix.relative(posix.dirname(from), to);
}
