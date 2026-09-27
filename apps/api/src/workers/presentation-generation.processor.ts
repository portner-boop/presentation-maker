import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type GeneratedPresentation, generatePresentation, type LlmClient } from '@pm/ml';
import { finalizeSources, GENERATION_TIME_BUDGET_MS, type GenerationProgress } from '@pm/shared';
import { cloneRepository } from '@pm/shared/node';
import type { Job } from 'bullmq';
import type { Env } from '../config/env.js';
import { LLM_CLIENT } from '../llm/llm.module.js';
import { PresentationsService } from '../presentations/presentations.service.js';
import { PreviewService } from '../previews/preview.service.js';
import { PRESENTATION_GENERATION_QUEUE, type PresentationGenerationJob } from '../queues/queues.js';
import { StorageService } from '../storage/storage.service.js';
import { TemplatesService } from '../templates/templates.service.js';

/** Генерация слайдов и текста спикера. GENERATION_CONCURRENCY задач параллельно, каждая в бюджете 5 минут. */
@Processor(PRESENTATION_GENERATION_QUEUE)
export class PresentationGenerationProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(PresentationGenerationProcessor.name);

  constructor(
    private readonly presentations: PresentationsService,
    private readonly templates: TemplatesService,
    private readonly storage: StorageService,
    private readonly previews: PreviewService,
    private readonly config: ConfigService<Env, true>,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient | null,
  ) {
    super();
  }

  onApplicationBootstrap() {
    this.worker.concurrency = this.config.get('GENERATION_CONCURRENCY', { infer: true });
  }

  async process(job: Job<PresentationGenerationJob>): Promise<void> {
    if (!this.llm)
      throw new Error('LLM не настроен: задайте LLM_BASE_URL, LLM_API_KEY и LLM_MODEL');
    const { presentationId } = job.data;
    const presentation = await this.presentations.get(presentationId);
    await this.presentations.markGenerating(presentationId);

    const template = await this.templates.get(presentation.templateId);
    const [profile, templateData, uploaded] = await Promise.all([
      this.templates.getProfile(template.id),
      this.storage.read(template.fileKey),
      this.presentations.sources(presentation),
    ]);
    // бюджет считается с начала задачи: клонирование репозитория тоже в него входит
    const signal = AbortSignal.timeout(GENERATION_TIME_BUDGET_MS);
    let sources = uploaded;
    if (presentation.gitUrl) {
      await this.presentations.setProgress(presentationId, { stage: 'sources' });
      const cloned = await cloneRepository(presentation.gitUrl, uploaded.length ? 'repo/' : '');
      sources = finalizeSources([...uploaded, ...cloned]).files;
    }

    // записи прогресса идут цепочкой: не по порядку или после READY они затёрли бы статус
    let progressChain = Promise.resolve();
    const onProgress = (progress: GenerationProgress) => {
      progressChain = progressChain
        .then(() => this.presentations.setProgress(presentationId, progress))
        .catch((error: Error) => this.logger.warn(`Progress update failed: ${error.message}`));
    };

    let result: GeneratedPresentation;
    try {
      result = await generatePresentation({
        template: templateData,
        profile,
        brief: presentation.brief,
        durationMinutes: presentation.durationMinutes ?? undefined,
        sources,
        llm: this.llm,
        signal,
        onProgress,
      });
    } finally {
      await progressChain;
    }
    // превью — вне бюджета генерации и не обязательно: без LibreOffice просто null
    const previewCount = await this.previews.render(`presentations/${presentationId}`, result.pptx);
    await this.presentations.markReady(presentationId, result, previewCount);

    const { totalMs, llm } = result.stats;
    this.logger.log(
      `Presentation ${presentationId}: ${result.slides.length} slides in ${(totalMs / 1000).toFixed(1)}s, ` +
        `${llm.requests} LLM calls, ${llm.inputTokens}+${llm.outputTokens} tokens`,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<PresentationGenerationJob> | undefined, error: Error) {
    if (!job) return;
    this.logger.error(
      `Presentation ${job.data.presentationId} generation failed: ${error.message}`,
    );
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.presentations.markFailed(job.data.presentationId, error.message);
    }
  }
}
