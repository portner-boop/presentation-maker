import { Module } from '@nestjs/common';
import { PresentationsModule } from '../presentations/presentations.module.js';
import { QueuesModule } from '../queues/queues.js';
import { TemplatesModule } from '../templates/templates.module.js';
import { PresentationGenerationProcessor } from './presentation-generation.processor.js';
import { TemplateAnalysisProcessor } from './template-analysis.processor.js';

/** Потребители очередей. Подключаются при APP_ROLE=all|worker. */
@Module({
  imports: [QueuesModule, TemplatesModule, PresentationsModule],
  providers: [TemplateAnalysisProcessor, PresentationGenerationProcessor],
})
export class WorkersModule {}
