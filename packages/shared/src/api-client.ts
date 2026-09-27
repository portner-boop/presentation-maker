import { z } from 'zod';
import { HealthSchema } from './schemas/health.js';
import { type CreatePresentationInput, PresentationSchema } from './schemas/presentation.js';
import { TemplateSchema } from './schemas/template.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface UploadTemplateInput {
  file: Blob;
  fileName: string;
  name?: string;
}

/** Типизированный клиент api. Общий для cli и будущего web: ответы валидируются схемами из shared. */
export function createApiClient({ baseUrl, fetch: fetchImpl = fetch }: ApiClientOptions) {
  const root = baseUrl.replace(/\/+$/, '');

  async function send(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetchImpl(`${root}${path}`, init);
    if (res.ok) return res;
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const body: unknown = isJson ? await res.json() : await res.text();
    throw new ApiError(res.status, errorMessage(body, res.statusText), body);
  }

  async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    return schema.parse(await (await send(path, init)).json());
  }

  const json = (method: string, data: unknown): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });

  return {
    health: () => request('/health', HealthSchema),

    templates: {
      list: () => request('/templates', z.array(TemplateSchema)),
      get: (id: string) => request(`/templates/${encodeURIComponent(id)}`, TemplateSchema),
      /** Исходный .pptx шаблона — для превью слайдов-образцов. */
      file: async (id: string) =>
        (await send(`/templates/${encodeURIComponent(id)}/file`)).arrayBuffer(),
      upload: ({ file, fileName, name }: UploadTemplateInput) => {
        const form = new FormData();
        form.append('file', file, fileName);
        if (name) form.append('name', name);
        return request('/templates', TemplateSchema, { method: 'POST', body: form });
      },
    },

    presentations: {
      list: () => request('/presentations', z.array(PresentationSchema)),
      get: (id: string) => request(`/presentations/${encodeURIComponent(id)}`, PresentationSchema),
      create: (input: CreatePresentationInput) =>
        request('/presentations', PresentationSchema, json('POST', input)),
      /** Запустить генерацию заново с теми же входными данными. */
      retry: (id: string) =>
        request(`/presentations/${encodeURIComponent(id)}/retry`, PresentationSchema, {
          method: 'POST',
        }),
      /** Готовый .pptx. */
      file: async (id: string) =>
        new Uint8Array(
          await (await send(`/presentations/${encodeURIComponent(id)}/file`)).arrayBuffer(),
        ),
      /** Текст выступления в markdown. */
      script: async (id: string) =>
        (await send(`/presentations/${encodeURIComponent(id)}/script`)).text(),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Прямые ссылки для скачивания через <a href download>. */
export function apiUrls(baseUrl: string) {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    presentationFile: (id: string) => `${root}/presentations/${encodeURIComponent(id)}/file`,
    presentationScript: (id: string) => `${root}/presentations/${encodeURIComponent(id)}/script`,
    templateFile: (id: string) => `${root}/templates/${encodeURIComponent(id)}/file`,
    /** PNG слайда (с 1). version — updatedAt записи: картинка кешируется навсегда, пока запись не изменится. */
    presentationSlide: (id: string, n: number, version: string) =>
      `${root}/presentations/${encodeURIComponent(id)}/slides/${n}?v=${encodeURIComponent(version)}`,
    templateSlide: (id: string, n: number, version: string) =>
      `${root}/templates/${encodeURIComponent(id)}/slides/${n}?v=${encodeURIComponent(version)}`,
  };
}

/** Nest отдаёт ошибки как `{ statusCode, message: string | string[], error }`. */
function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body) return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}
