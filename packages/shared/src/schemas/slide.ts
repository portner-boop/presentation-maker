import { z } from 'zod';
import { LayoutKind } from './template.js';

export const SlideBlockSchema = z.object({
  key: z.string().describe('Ключ слота макета'),
  paragraphs: z.array(z.string()),
});
export type SlideBlock = z.infer<typeof SlideBlockSchema>;

/**
 * Слайд в Presentation IR: промежуточный формат между LLM и рендером .pptx.
 * Та же модель идёт в превью, экспорт и будущий редактор.
 */
export const SlideSchema = z.object({
  index: z.number().int().nonnegative(),
  layoutId: z.string(),
  kind: LayoutKind,
  renderMode: z.enum(['native', 'creative']),
  title: z.string(),
  blocks: z.array(SlideBlockSchema),
  speakerNotes: z.string().describe('Текст, который спикер проговаривает на этом слайде'),
  durationSeconds: z.number().int().positive(),
  warnings: z.array(z.string()),
});
export type Slide = z.infer<typeof SlideSchema>;
