import { BullModule } from '@nestjs/bullmq';

export const TEMPLATE_ANALYSIS_QUEUE = 'template-analysis';
export const PRESENTATION_GENERATION_QUEUE = 'presentation-generation';

export interface TemplateAnalysisJob {
  templateId: string;
}

export interface PresentationGenerationJob {
  presentationId: string;
}

export const QueuesModule = BullModule.registerQueue(
  {
    name: TEMPLATE_ANALYSIS_QUEUE,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  },
  {
    name: PRESENTATION_GENERATION_QUEUE,
    // генерация ограничена бюджетом времени, ретрай без ожидания
    defaultJobOptions: {
      attempts: 2,
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  },
);
