import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CreatePresentationInput,
  CreatePresentationSchema,
  PresentationSchema,
} from '@pm/shared';
import { z } from 'zod';
import { PreviewService } from '../previews/preview.service.js';
import { PresentationsService } from './presentations.service.js';

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

@ApiTags('presentations')
@Controller('presentations')
export class PresentationsController {
  constructor(
    private readonly presentations: PresentationsService,
    private readonly previews: PreviewService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Поставить генерацию презентации по готовому шаблону в очередь' })
  @ApiAcceptedResponse({ standardSchema: PresentationSchema })
  create(@Body({ schema: CreatePresentationSchema }) input: CreatePresentationInput) {
    return this.presentations.create(input);
  }

  @Get()
  @ApiOperation({ summary: 'Список презентаций' })
  @ApiOkResponse({ standardSchema: z.array(PresentationSchema) })
  list() {
    return this.presentations.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Презентация: статус, слайды и текст спикера' })
  @ApiOkResponse({ standardSchema: PresentationSchema })
  get(@Param('id', { schema: z.uuid() }) id: string) {
    return this.presentations.get(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Перезапустить упавшую генерацию с теми же входными данными' })
  @ApiAcceptedResponse({ standardSchema: PresentationSchema })
  retry(@Param('id', { schema: z.uuid() }) id: string) {
    return this.presentations.retry(id);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Скачать .pptx' })
  @ApiProduces(PPTX_MIME)
  async file(@Param('id', { schema: z.uuid() }) id: string) {
    const { data, fileName } = await this.presentations.file(id, 'pptx');
    return new StreamableFile(data, { type: PPTX_MIME, disposition: attachment(fileName) });
  }

  @Get(':id/script')
  @ApiOperation({ summary: 'Скачать текст выступления (markdown)' })
  @ApiProduces('text/markdown')
  async script(@Param('id', { schema: z.uuid() }) id: string) {
    const { data, fileName } = await this.presentations.file(id, 'script');
    return new StreamableFile(data, {
      type: 'text/markdown; charset=utf-8',
      disposition: attachment(fileName),
    });
  }

  @Get(':id/slides/:n')
  @ApiOperation({ summary: 'PNG-превью слайда (с 1)' })
  @ApiProduces('image/png')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async slide(
    @Param('id', { schema: z.uuid() }) id: string,
    @Param('n', { schema: z.coerce.number().int().positive() }) n: number,
  ) {
    return new StreamableFile(await this.previews.read(`presentations/${id}`, n), {
      type: 'image/png',
    });
  }
}

function attachment(fileName: string): string {
  return `attachment; filename="presentation${fileName.slice(fileName.lastIndexOf('.'))}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
