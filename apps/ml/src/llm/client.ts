import OpenAI from 'openai';
import { z } from 'zod';
import { Semaphore } from './semaphore.js';

/**
 * Как просить у модели JSON. Не все OpenAI-совместимые серверы умеют json_schema,
 * поэтому клиент сам понижает режим, если сервер отвечает 400 на response_format.
 */
export type StructuredOutputMode = 'json_schema' | 'json_object' | 'prompt';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Одновременных запросов на процесс: 3 генерации × ~12 слайдов упираются в лимиты провайдера. */
  maxConcurrency?: number;
  structuredOutput?: StructuredOutputMode;
  timeoutMs?: number;
}

/** Счётчики на одну задачу (анализ шаблона или генерацию). */
export class LlmUsage {
  requests = 0;
  inputTokens = 0;
  outputTokens = 0;
}

export interface ObjectRequest<T> {
  name: string;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  maxTokens?: number;
  signal?: AbortSignal;
  usage?: LlmUsage;
}

const MODE_ORDER: StructuredOutputMode[] = ['json_schema', 'json_object', 'prompt'];

export class LlmClient {
  readonly model: string;
  private readonly openai: OpenAI;
  private readonly semaphore: Semaphore;
  private mode: StructuredOutputMode;

  constructor(config: LlmConfig) {
    this.model = config.model;
    this.mode = config.structuredOutput ?? 'json_schema';
    this.semaphore = new Semaphore(config.maxConcurrency ?? 12);
    this.openai = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? 120_000,
      maxRetries: 2,
    });
  }

  /** Ответ строго по zod-схеме. Невалидный JSON или несовпадение со схемой — один повтор с текстом ошибки. */
  async object<T>(req: ObjectRequest<T>): Promise<T> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ];

    for (let attempt = 0; ; attempt++) {
      const content = await this.complete(req, messages);
      const parsed = parseJson(content);
      const result = parsed.ok ? req.schema.safeParse(parsed.value) : undefined;
      if (result?.success) return result.data;

      const problem = result ? z.prettifyError(result.error) : 'ответ не является JSON';
      if (attempt >= 1)
        throw new Error(`LLM вернула невалидный ответ для "${req.name}": ${problem}`);
      messages.push(
        { role: 'assistant', content },
        {
          role: 'user',
          content: `Ответ не прошёл проверку: ${problem}\nВерни исправленный JSON целиком.`,
        },
      );
    }
  }

  private async complete<T>(
    req: ObjectRequest<T>,
    messages: OpenAI.ChatCompletionMessageParam[],
  ): Promise<string> {
    return this.semaphore.run(async () => {
      for (;;) {
        const mode = this.mode;
        try {
          const res = await this.openai.chat.completions.create(
            {
              model: this.model,
              messages:
                mode === 'json_schema' ? messages : withJsonInstruction(messages, req.schema),
              max_completion_tokens: req.maxTokens ?? 2_000,
              response_format: responseFormat(mode, req.name, req.schema),
            },
            { signal: req.signal },
          );
          if (req.usage) {
            req.usage.requests += 1;
            req.usage.inputTokens += res.usage?.prompt_tokens ?? 0;
            req.usage.outputTokens += res.usage?.completion_tokens ?? 0;
          }
          return res.choices[0]?.message.content ?? '';
        } catch (error) {
          if (!isResponseFormatUnsupported(error) || mode === 'prompt') throw error;
          this.mode = MODE_ORDER[MODE_ORDER.indexOf(mode) + 1];
        }
      }
    });
  }
}

function responseFormat(
  mode: StructuredOutputMode,
  name: string,
  schema: z.ZodType,
): OpenAI.ChatCompletionCreateParams['response_format'] {
  if (mode === 'json_schema') {
    return {
      type: 'json_schema',
      json_schema: {
        name,
        strict: true,
        schema: z.toJSONSchema(schema) as Record<string, unknown>,
      },
    };
  }
  if (mode === 'json_object') return { type: 'json_object' };
  return undefined;
}

/** json_object и prompt не передают форму ответа: схему кладём в системный промпт. */
function withJsonInstruction(
  messages: OpenAI.ChatCompletionMessageParam[],
  schema: z.ZodType,
): OpenAI.ChatCompletionMessageParam[] {
  const [system, ...rest] = messages;
  const hint = `\n\nОтвечай только JSON без пояснений, по этой JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;
  return [{ role: 'system', content: `${system.content}${hint}` }, ...rest];
}

function isResponseFormatUnsupported(error: unknown): boolean {
  return (
    error instanceof OpenAI.APIError &&
    error.status === 400 &&
    /response_format|json_schema|json_object/i.test(error.message)
  );
}

/** Модели любят заворачивать JSON в ```json … ``` или добавлять текст вокруг. */
export function parseJson(content: string): { ok: true; value: unknown } | { ok: false } {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? content).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) return { ok: false };
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  try {
    return { ok: true, value: JSON.parse(candidate.slice(start, end + 1)) };
  } catch {
    return { ok: false };
  }
}
