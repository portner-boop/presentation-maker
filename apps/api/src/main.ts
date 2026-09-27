import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AppRole } from './config/env.js';

if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const role = AppRole.parse(process.env.APP_ROLE ?? 'all');

  // worker: только потребители очередей, без http. Масштабируется отдельно от api.
  if (role === 'worker') {
    const app = await NestFactory.createApplicationContext(AppModule.register({ workers: true }));
    app.enableShutdownHooks();
    Logger.log('Worker started', 'Bootstrap');
    return;
  }

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({ workers: role === 'all' }),
  );
  app.enableShutdownHooks();
  // исходники репозитория и документация приходят в теле запроса
  app.useBodyParser('json', { limit: '20mb' });
  app.enableCors();
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Presentation Maker API')
      .setDescription('Шаблоны, обучение на шаблоне, генерация презентаций')
      .setVersion('0.0.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`http://localhost:${port} (role: ${role}), swagger: /docs`, 'Bootstrap');
}

void bootstrap();
