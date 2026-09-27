import { z } from 'zod';
import { MAX_SOURCES_CHARS } from '../constants.js';
import { GIT_URL_PATTERN } from '../sources.js';
import { SlideSchema } from './slide.js';

export const PresentationStatus = z.enum(['PENDING', 'GENERATING', 'READY', 'FAILED']);
export type PresentationStatus = z.infer<typeof PresentationStatus>;

/** Материал к задаче: файл из репозитория, документация, история команды. */
export const SourceFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string(),
});
export type SourceFile = z.infer<typeof SourceFileSchema>;

export const CreatePresentationSchema = z.object({
  templateId: z.uuid(),
  brief: z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .describe('Задача: о чём презентация, для кого, ключевые тезисы'),
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(120)
    .optional()
    .describe('Лимит выступления, от него зависит число слайдов и объём текста'),
  sources: z
    .array(SourceFileSchema)
    .max(2_000)
    .optional()
    .refine(
      (files) => !files || files.reduce((sum, f) => sum + f.content.length, 0) <= MAX_SOURCES_CHARS,
      `sources: суммарно не больше ${MAX_SOURCES_CHARS} символов`,
    )
    .describe('Репозиторий, документация, история команды — текстом'),
  gitUrl: z
    .string()
    .trim()
    .regex(GIT_URL_PATTERN, 'Нужна https-ссылка на публичный репозиторий')
    .max(500)
    .optional()
    .describe('Репозиторий, который воркер склонирует сам'),
});
export type CreatePresentationInput = z.infer<typeof CreatePresentationSchema>;

export const GenerationStatsSchema = z.object({
  model: z.string(),
  totalMs: z.number(),
  stages: z.object({
    planMs: z.number(),
    composeMs: z.number(),
    fitMs: z.number(),
    renderMs: z.number(),
  }),
  llm: z.object({
    requests: z.number().int(),
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
  }),
});
export type GenerationStats = z.infer<typeof GenerationStatsSchema>;

/** Где сейчас генерация: для живого статуса в интерфейсе. */
export const GenerationStage = z.enum(['sources', 'plan', 'compose', 'render']);
export type GenerationStage = z.infer<typeof GenerationStage>;

export const GenerationProgressSchema = z.object({
  stage: GenerationStage,
  done: z.number().int().nonnegative().optional(),
  total: z.number().int().positive().optional(),
});
export type GenerationProgress = z.infer<typeof GenerationProgressSchema>;

export const PresentationSchema = z.object({
  id: z.uuid(),
  templateId: z.uuid(),
  title: z.string().nullable(),
  brief: z.string(),
  durationMinutes: z.number().int().nullable(),
  gitUrl: z.string().nullable(),
  status: PresentationStatus,
  progress: GenerationProgressSchema.nullable(),
  slides: z.array(SlideSchema).nullable(),
  stats: GenerationStatsSchema.nullable(),
  previewCount: z.number().int().nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Presentation = z.infer<typeof PresentationSchema>;
