import pptxgenModule from 'pptxgenjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeTemplate } from './analysis/analyze-template.js';
import { PptxPackage } from './pptx/package.js';
import { parsePresentation } from './pptx/parse.js';
import { renderNative, type ShapeFill } from './render/native.js';

// типы pptxgenjs описывают ESM-default, а в Node это CommonJS с module.exports = класс
const PptxGenJS = pptxgenModule as unknown as typeof pptxgenModule.default;
type Slide = ReturnType<InstanceType<typeof PptxGenJS>['addSlide']>;

/** Шаблон как у дизайнеров: мастер с плейсхолдерами, свободные текстовые блоки, повторяющийся футер. */
async function buildTemplate(): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.defineSlideMaster({
    title: 'BRAND',
    background: { color: '0B0F1A' },
    objects: [
      {
        placeholder: {
          options: { name: 'title', type: 'title', x: 0.8, y: 0.45, w: 11.5, h: 1, fontSize: 34 },
          text: '',
        },
      },
      {
        placeholder: {
          options: { name: 'body', type: 'body', x: 0.8, y: 1.7, w: 11.5, h: 4.9, fontSize: 22 },
          text: '',
        },
      },
    ],
  });
  const footer = (s: Slide) =>
    s.addText('BRAND 2026', { x: 10.5, y: 7.0, w: 2.6, h: 0.35, fontSize: 10 });

  let s = pptx.addSlide({ masterName: 'BRAND' });
  s.addText('Большой заголовок титульного слайда', {
    x: 0.8,
    y: 2.2,
    w: 11.5,
    h: 1.6,
    fontSize: 44,
  });
  s.addText('Подзаголовок', { x: 0.8, y: 4.0, w: 11.5, h: 0.6, fontSize: 22 });
  s.addNotes('старые заметки');
  footer(s);

  s = pptx.addSlide({ masterName: 'BRAND' });
  s.addText('Тезисы', { placeholder: 'title' });
  s.addText(
    ['Раз', 'Два', 'Три'].map((text) => ({ text, options: { bullet: true } })),
    { placeholder: 'body' },
  );
  footer(s);

  s = pptx.addSlide({ masterName: 'BRAND' });
  s.addText('Карточки', { placeholder: 'title' });
  for (let i = 0; i < 3; i++) {
    s.addText(`0${i + 1}`, { x: 1.1 + i * 4, y: 2.0, w: 1, h: 0.5, fontSize: 16 });
    s.addText(`Шаг ${i + 1}`, { x: 1.1 + i * 4, y: 2.6, w: 3.2, h: 0.6, fontSize: 24 });
    s.addText('Описание шага', { x: 1.1 + i * 4, y: 3.3, w: 3.2, h: 2.6, fontSize: 16 });
  }
  footer(s);

  return new Uint8Array((await pptx.write({ outputType: 'nodebuffer' })) as Buffer);
}

describe('шаблон → анализ → нативный рендер', () => {
  let template: Uint8Array;
  beforeAll(async () => {
    template = await buildTemplate();
  });

  it('строит библиотеку макетов без пустых плейсхолдеров, футера и номеров', async () => {
    const profile = await analyzeTemplate({ data: template });
    expect(profile.layouts.map((l) => l.kind)).toEqual(['title', 'bullets', 'cards']);

    const [title, bullets, cards] = profile.layouts;
    expect(title.slots.map((s) => s.key)).toEqual(['title', 'subtitle']);
    expect(bullets.slots.find((s) => s.key === 'body')?.bullets).toBe(true);
    expect(cards.items).toBe(3);
    expect(cards.slots.map((s) => s.key)).toEqual([
      'title',
      'item1_title',
      'item1',
      'item2_title',
      'item2',
      'item3_title',
      'item3',
    ]);
  });

  it('клонирует образцы, меняет текст поабзацно и пишет заметки', async () => {
    const profile = await analyzeTemplate({ data: template });
    const bulletsLayout = profile.layouts[1];
    const fill = (paragraphs: string[]): ShapeFill => ({
      paragraphs,
      baseSizePt: 22,
      fontScale: 1,
    });
    const bodyId = bulletsLayout.slots.find((s) => s.key === 'body')!.shapeId;
    const titleId = bulletsLayout.slots.find((s) => s.key === 'title')!.shapeId;

    const output = await renderNative(template, [
      {
        sourceSlide: 2,
        notes: 'Новые заметки',
        fills: new Map([
          [titleId, fill(['Новый заголовок'])],
          [bodyId, fill(['Первый', 'Второй', 'Третий', 'Четвёртый'])],
        ]),
      },
      {
        sourceSlide: 2,
        fills: new Map([
          [titleId, fill(['Ещё слайд'])],
          [bodyId, fill(['Один'])],
        ]),
      },
    ]);

    const pkg = await PptxPackage.load(output);
    const info = await parsePresentation(pkg);
    expect(info.slides).toHaveLength(2);

    const body = info.slides[0].shapes.find((s) => s.id === bodyId)!;
    expect(body.paragraphs.map((p) => p.text)).toEqual(['Первый', 'Второй', 'Третий', 'Четвёртый']);
    expect(body.paragraphs.every((p) => p.bullet)).toBe(true);
    expect(info.slides[1].shapes.find((s) => s.id === titleId)?.text).toBe('Ещё слайд');

    const allText = info.slides.flatMap((s) => s.shapes.map((sh) => sh.text)).join(' ');
    expect(allText).not.toContain('Большой заголовок');
    expect(allText).toContain('BRAND 2026');

    const notes = pkg.paths('ppt/notesSlides/').filter((p) => p.endsWith('.xml'));
    expect(notes).toHaveLength(1);
    expect((await pkg.xml(notes[0])).documentElement!.textContent).toContain('Новые заметки');
  });
});
