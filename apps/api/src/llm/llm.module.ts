import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmClient } from '@pm/ml';
import type { Env } from '../config/env.js';

export const LLM_CLIENT = Symbol('LLM_CLIENT');

/** Один клиент на процесс: его семафор ограничивает параллельные запросы всех генераций сразу. */
@Global()
@Module({
  providers: [
    {
      provide: LLM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): LlmClient | null => {
        const baseUrl = config.get('LLM_BASE_URL', { infer: true });
        const apiKey = config.get('LLM_API_KEY', { infer: true });
        const model = config.get('LLM_MODEL', { infer: true });
        if (!baseUrl || !apiKey || !model) {
          Logger.warn(
            'LLM не настроен (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL): генерация недоступна',
            'LlmModule',
          );
          return null;
        }
        return new LlmClient({
          baseUrl,
          apiKey,
          model,
          maxConcurrency: config.get('LLM_MAX_CONCURRENCY', { infer: true }),
          structuredOutput: config.get('LLM_STRUCTURED_OUTPUT', { infer: true }),
        });
      },
    },
  ],
  exports: [LLM_CLIENT],
})
export class LlmModule {}
