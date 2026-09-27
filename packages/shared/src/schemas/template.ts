import { z } from 'zod';

export const TemplateStatus = z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']);
export type TemplateStatus = z.infer<typeof TemplateStatus>;

/** Тип композиции. По нему планировщик выбирает слайд, а код подбирает конкретный макет. */
export const LayoutKind = z.enum([
  'title',
  'section',
  'bullets',
  'text',
  'two-column',
  'cards',
  'image-text',
  'closing',
  'other',
]);
export type LayoutKind = z.infer<typeof LayoutKind>;

export const SlotRole = z.enum(['title', 'subtitle', 'body', 'item-title', 'item-text']);
export type SlotRole = z.infer<typeof SlotRole>;

/** Текстовое поле макета, которое заполняет генерация. Вместимость посчитана по геометрии и кеглю. */
export const SlotSchema = z.object({
  key: z.string().describe('Семантический ключ для LLM: title, subtitle, body, left, item2_title…'),
  shapeId: z.string().describe('id фигуры (cNvPr) в исходном слайде шаблона'),
  role: SlotRole,
  bullets: z.boolean(),
  fontSizePt: z.number(),
  charsPerLine: z.number().int().positive(),
  maxLines: z.number().int().positive(),
  sample: z.string().describe('Текст из шаблона: пример объёма и стиля'),
});
export type Slot = z.infer<typeof SlotSchema>;

export const LayoutSchema = z.object({
  id: z.string(),
  kind: LayoutKind,
  sourceSlide: z.number().int().positive().describe('Номер слайда-образца в шаблоне, с 1'),
  items: z.number().int().nonnegative().describe('Сколько колонок/карточек в композиции'),
  hasImage: z.boolean(),
  slots: z.array(SlotSchema),
});
export type Layout = z.infer<typeof LayoutSchema>;

/**
 * Результат «обучения на шаблоне»: кирпичики бренда, из которых потом собирается презентация.
 * Считается в неограниченное время подготовки, до старта генерации.
 */
export const TemplateProfileSchema = z.object({
  version: z.number().int(),
  slideSize: z.object({ widthEmu: z.number().int(), heightEmu: z.number().int() }),
  colors: z.array(z.string()).describe('Палитра бренда, hex'),
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
  }),
  layouts: z.array(LayoutSchema),
  tone: z.string().optional().describe('Тон и характерные формулировки бренда'),
  warnings: z.array(z.string()),
});
export type TemplateProfile = z.infer<typeof TemplateProfileSchema>;

export const TemplateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  fileName: z.string(),
  status: TemplateStatus,
  profile: TemplateProfileSchema.nullable(),
  previewCount: z.number().int().nullable().describe('Сколько PNG-превью слайдов отрендерено'),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Template = z.infer<typeof TemplateSchema>;
