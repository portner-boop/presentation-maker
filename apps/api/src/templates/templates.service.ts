import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { InjectQueue } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type TemplateProfile, TemplateProfileSchema } from '@pm/shared';
import type { Queue } from 'bullmq';
import type { Cache } from 'cache-manager';
import type { Env } from '../config/env.js';
import type { Template } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TEMPLATE_ANALYSIS_QUEUE, type TemplateAnalysisJob } from '../queues/queues.js';
import { StorageService } from '../storage/storage.service.js';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(TEMPLATE_ANALYSIS_QUEUE) private readonly queue: Queue<TemplateAnalysisJob>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /** Сохраняет файл и ставит шаблон в очередь на «обучение». Шаблон доступен для генерации после READY. */
  async create(file: Express.Multer.File, name?: string): Promise<Template> {
    const id = randomUUID();
    const ext = extname(file.originalname).toLowerCase();
    const fileKey = `templates/${id}${ext}`;
    await this.storage.save(fileKey, file.buffer);

    const template = await this.prisma.template.create({
      data: {
        id,
        name: name ?? basename(file.originalname, ext),
        fileName: file.originalname,
        fileKey,
      },
    });
    await this.queue.add('analyze', { templateId: id }, { jobId: id });
    return template;
  }

  list(): Promise<Template[]> {
    return this.prisma.template.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string): Promise<Template> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }

  /** Исходный файл шаблона — для превью слайдов-образцов в интерфейсе. */
  async file(id: string): Promise<{ data: Buffer; fileName: string }> {
    const template = await this.get(id);
    return { data: await this.storage.read(template.fileKey), fileName: template.fileName };
  }

  /** Профиль готового шаблона. Кешируется: параллельные генерации по одному шаблону не ходят в БД. */
  async getProfile(id: string): Promise<TemplateProfile> {
    const key = profileCacheKey(id);
    const cached = await this.cache.get<TemplateProfile>(key);
    if (cached) return cached;

    const template = await this.get(id);
    if (template.status !== 'READY' || !template.profile) {
      throw new ConflictException(`Template ${id} is not ready (status: ${template.status})`);
    }
    const profile = TemplateProfileSchema.parse(template.profile);
    await this.cache.set(key, profile, this.config.get('CACHE_TTL_MS', { infer: true }));
    return profile;
  }

  async markProcessing(id: string): Promise<void> {
    await this.prisma.template.update({
      where: { id },
      data: { status: 'PROCESSING', error: null },
    });
  }

  async markReady(
    id: string,
    profile: TemplateProfile,
    previewCount: number | null,
  ): Promise<void> {
    await this.prisma.template.update({
      where: { id },
      data: { status: 'READY', profile, previewCount },
    });
    await this.cache.del(profileCacheKey(id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.template.update({ where: { id }, data: { status: 'FAILED', error } });
  }
}

const profileCacheKey = (id: string) => `template-profile:${id}`;
