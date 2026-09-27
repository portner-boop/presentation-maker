import { createKeyv } from '@keyv/redis';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { type Env, validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { LlmModule } from './llm/llm.module.js';
import { PresentationsModule } from './presentations/presentations.module.js';
import { PreviewsModule } from './previews/previews.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { WorkersModule } from './workers/workers.module.js';

export interface AppModuleOptions {
  /** Поднимать ли потребителей очередей в этом процессе. */
  workers: boolean;
}

@Module({})
export class AppModule {
  static register({ workers }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // .env подхватывается в main.ts через process.loadEnvFile
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService<Env, true>) => ({
            connection: { url: config.get('REDIS_URL', { infer: true }) },
          }),
        }),
        CacheModule.registerAsync({
          isGlobal: true,
          inject: [ConfigService],
          useFactory: (config: ConfigService<Env, true>) => ({
            stores: [createKeyv(config.get('REDIS_URL', { infer: true }), { namespace: 'cache' })],
            ttl: config.get('CACHE_TTL_MS', { infer: true }),
          }),
        }),
        PrismaModule,
        StorageModule,
        PreviewsModule,
        LlmModule,
        HealthModule,
        TemplatesModule,
        PresentationsModule,
        ...(workers ? [WorkersModule] : []),
      ],
    };
  }
}
