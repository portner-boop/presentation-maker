import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { analyzeTemplate, type LlmClient, LlmUsage } from '@pm/ml';
import type { Job } from 'bullmq';
import type { Env } from '../config/env.js';
import { LLM_CLIENT } from '../llm/llm.module.js';
import { PreviewService } from '../previews/preview.service.js';
import { TEMPLATE_ANALYSIS_QUEUE, type TemplateAnalysisJob } from '../queues/queues.js';
import { StorageService } from '../storage/storage.service.js';
import { TemplatesService } from '../templates/templates.service.js';

/** «Обучение на шаблоне»: подготовительный этап, по времени не ограничен. */
@Processor(TEMPLATE_ANALYSIS_QUEUE)
export class TemplateAnalysisProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(TemplateAnalysisProcessor.name);

  constructor(
    private readonly templates: TemplatesService,
    private readonly storage: StorageService,
    private readonly previews: PreviewService,
    private readonly config: ConfigService<Env, true>,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient | null,
  ) {
    super();
  }

  onApplicationBootstrap() {
    this.worker.concurrency = this.config.get('TEMPLATE_ANALYSIS_CONCURRENCY', { infer: true });
  }

  async process(job: Job<TemplateAnalysisJob>): Promise<void> {
    const { templateId } = job.data;
    const template = await this.templates.get(templateId);
    await this.templates.markProcessing(templateId);

    const usage = new LlmUsage();
    const data = await this.storage.read(template.fileKey);
    const [profile, previewCount] = await Promise.all([
      analyzeTemplate({ data, llm: this.llm ?? undefined, usage }),
      this.previews.render(`templates/${templateId}`, data),
    ]);
    await this.templates.markReady(templateId, profile, previewCount);
    this.logger.log(
      `Template ${templateId} is ready: ${profile.layouts.length} layouts, ${usage.requests} LLM calls` +
        (profile.warnings.length ? `, warnings: ${profile.warnings.join('; ')}` : ''),
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<TemplateAnalysisJob> | undefined, error: Error) {
    if (!job) return;
    this.logger.error(`Template ${job.data.templateId} analysis failed: ${error.message}`);
    // FAILED ставим, только когда ретраи закончились
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.templates.markFailed(job.data.templateId, error.message);
    }
  }
}
