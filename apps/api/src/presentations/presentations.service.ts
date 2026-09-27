import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePresentationInput,
  GenerationProgress,
  GenerationStats,
  Slide,
  SourceFile,
} from '@pm/shared';
import type { Queue } from 'bullmq';
import { type Presentation, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PRESENTATION_GENERATION_QUEUE, type PresentationGenerationJob } from '../queues/queues.js';
import { StorageService } from '../storage/storage.service.js';
import { TemplatesService } from '../templates/templates.service.js';

export interface GenerationOutput {
  title: string;
  slides: Slide[];
  pptx: Uint8Array;
  script: string;
  stats: GenerationStats;
}

@Injectable()
export class PresentationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly templates: TemplatesService,
    @InjectQueue(PRESENTATION_GENERATION_QUEUE)
    private readonly queue: Queue<PresentationGenerationJob>,
  ) {}

  async create({ sources, ...input }: CreatePresentationInput): Promise<Presentation> {
    const template = await this.templates.get(input.templateId);
    if (template.status !== 'READY') {
      throw new ConflictException(
        `Template ${template.id} is not ready (status: ${template.status})`,
      );
    }

    const id = randomUUID();
    let sourcesKey: string | undefined;
    if (sources?.length) {
      sourcesKey = `presentations/${id}/sources.json`;
      await this.storage.save(sourcesKey, JSON.stringify(sources));
    }
    const presentation = await this.prisma.presentation.create({
      data: { id, ...input, sourcesKey },
    });
    await this.queue.add('generate', { presentationId: id }, { jobId: id });
    return presentation;
  }

  list(): Promise<Presentation[]> {
    return this.prisma.presentation.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string): Promise<Presentation> {
    const presentation = await this.prisma.presentation.findUnique({ where: { id } });
    if (!presentation) throw new NotFoundException(`Presentation ${id} not found`);
    return presentation;
  }

  async sources(presentation: Presentation): Promise<SourceFile[]> {
    if (!presentation.sourcesKey) return [];
    return JSON.parse((await this.storage.read(presentation.sourcesKey)).toString('utf8'));
  }

  /** Готовый файл: .pptx или текст выступления в markdown. */
  async file(id: string, kind: 'pptx' | 'script'): Promise<{ data: Buffer; fileName: string }> {
    const presentation = await this.get(id);
    const key = kind === 'pptx' ? presentation.fileKey : presentation.scriptKey;
    if (!key)
      throw new NotFoundException(
        `Presentation ${id} has no ${kind} yet (status: ${presentation.status})`,
      );
    const base = (presentation.title ?? 'presentation')
      .replace(/[\\/:*?"<>|\n\r]+/g, ' ')
      .trim()
      .slice(0, 80);
    return {
      data: await this.storage.read(key),
      fileName: `${base}.${kind === 'pptx' ? 'pptx' : 'md'}`,
    };
  }

  /** Перезапуск упавшей генерации с теми же задачей, материалами и шаблоном. */
  async retry(id: string): Promise<Presentation> {
    const presentation = await this.get(id);
    if (presentation.status !== 'FAILED') {
      throw new ConflictException(
        `Presentation ${id} is ${presentation.status}, only FAILED can be retried`,
      );
    }
    const updated = await this.prisma.presentation.update({
      where: { id },
      data: { status: 'PENDING', error: null, progress: Prisma.DbNull },
    });
    // jobId уникален на попытку: BullMQ игнорирует add с id уже существующей задачи
    await this.queue.add('generate', { presentationId: id }, { jobId: `${id}-r${Date.now()}` });
    return updated;
  }

  async markGenerating(id: string): Promise<void> {
    await this.prisma.presentation.update({
      where: { id },
      data: { status: 'GENERATING', error: null, progress: Prisma.DbNull },
    });
  }

  async setProgress(id: string, progress: GenerationProgress): Promise<void> {
    await this.prisma.presentation.update({ where: { id }, data: { progress } });
  }

  async markReady(
    id: string,
    output: GenerationOutput,
    previewCount: number | null,
  ): Promise<void> {
    const fileKey = `presentations/${id}/presentation.pptx`;
    const scriptKey = `presentations/${id}/script.md`;
    await Promise.all([
      this.storage.save(fileKey, output.pptx),
      this.storage.save(scriptKey, output.script),
    ]);
    await this.prisma.presentation.update({
      where: { id },
      data: {
        status: 'READY',
        progress: Prisma.DbNull,
        title: output.title,
        slides: output.slides,
        stats: output.stats,
        fileKey,
        scriptKey,
        previewCount,
      },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.presentation.update({
      where: { id },
      data: { status: 'FAILED', error, progress: Prisma.DbNull },
    });
  }
}
