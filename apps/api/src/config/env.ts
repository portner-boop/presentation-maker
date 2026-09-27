import { z } from 'zod';

export const AppRole = z.enum(['all', 'api', 'worker']);
export type AppRole = z.infer<typeof AppRole>;

/** Пустая строка из .env (`LLM_API_KEY=`) значит «не задано». */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ROLE: AppRole.default('all'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  STORAGE_DIR: z.string().default('./storage'),
  TEMPLATE_ANALYSIS_CONCURRENCY: z.coerce.number().int().positive().default(1),
  GENERATION_CONCURRENCY: z.coerce.number().int().positive().default(3),
  // OpenAI-совместимый API. Без него анализ шаблона работает (без тона бренда), генерация — нет
  LLM_BASE_URL: optional(z.url()),
  LLM_API_KEY: optional(z.string()),
  LLM_MODEL: optional(z.string()),
  LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().default(12),
  LLM_STRUCTURED_OUTPUT: z.enum(['json_schema', 'json_object', 'prompt']).default('json_schema'),
  // превью слайдов через LibreOffice + poppler; без них генерация работает, превью нет
  PREVIEW_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SOFFICE_PATH: optional(z.string()),
  PDFTOPPM_PATH: optional(z.string()),
  CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
});
export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  return result.data;
}
