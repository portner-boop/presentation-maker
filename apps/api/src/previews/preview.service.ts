import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type PreviewOptions, previewAvailable, renderPreviews } from '@pm/ml';
import type { Env } from '../config/env.js';
import { StorageService } from '../storage/storage.service.js';

/**
 * PNG-превью слайдов для интерфейса. Необязательная часть: если LibreOffice нет или рендер упал,
 * шаблон и презентация всё равно готовы, интерфейс покажет текстовое превью.
 */
@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);
  private readonly options: PreviewOptions;
  private warned = false;

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.options = {
      soffice: config.get('SOFFICE_PATH', { infer: true }),
      pdftoppm: config.get('PDFTOPPM_PATH', { infer: true }),
    };
  }

  /** Рендерит слайды в `${prefix}/slides/N.png` и возвращает их число, либо null без превью. */
  async render(prefix: string, pptx: Uint8Array): Promise<number | null> {
    if (!this.config.get('PREVIEW_ENABLED', { infer: true })) return null;
    if (!(await previewAvailable(this.options))) {
      if (!this.warned)
        this.logger.warn('LibreOffice/poppler не найдены: превью слайдов отключено');
      this.warned = true;
      return null;
    }
    try {
      const images = await renderPreviews(pptx, this.options);
      await Promise.all(
        images.map((image, i) => this.storage.save(slideKey(prefix, i + 1), image)),
      );
      return images.length;
    } catch (error) {
      this.logger.warn(`Превью ${prefix} не построено: ${(error as Error).message}`);
      return null;
    }
  }

  async read(prefix: string, n: number): Promise<Buffer> {
    try {
      return await this.storage.read(slideKey(prefix, n));
    } catch {
      throw new NotFoundException(`Slide preview ${n} not found`);
    }
  }
}

const slideKey = (prefix: string, n: number) => `${prefix}/slides/${n}.png`;
