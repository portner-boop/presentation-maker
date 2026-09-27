import { extname } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { MAX_TEMPLATE_SIZE_BYTES, TEMPLATE_FILE_EXTENSIONS, TemplateSchema } from '@pm/shared';
import { z } from 'zod';
import { PreviewService } from '../previews/preview.service.js';
import { TemplatesService } from './templates.service.js';

const TemplateNameSchema = z.string().trim().min(1).max(200).optional();

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly previews: PreviewService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Загрузить шаблон (.pptx/.potx) и поставить его в очередь на анализ' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
      },
    },
  })
  @ApiAcceptedResponse({ standardSchema: TemplateSchema })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_TEMPLATE_SIZE_BYTES } }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    // схема на поле, а не на всё тело: иначе swagger затирает описание multipart из @ApiBody
    @Body('name', { schema: TemplateNameSchema }) name: string | undefined,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const ext = extname(file.originalname).toLowerCase();
    if (!(TEMPLATE_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new BadRequestException(
        `Expected ${TEMPLATE_FILE_EXTENSIONS.join(' or ')}, got "${ext}"`,
      );
    }
    return this.templates.create(file, name);
  }

  @Get()
  @ApiOperation({ summary: 'Список шаблонов' })
  @ApiOkResponse({ standardSchema: z.array(TemplateSchema) })
  list() {
    return this.templates.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Шаблон и статус его обработки' })
  @ApiOkResponse({ standardSchema: TemplateSchema })
  get(@Param('id', { schema: z.uuid() }) id: string) {
    return this.templates.get(id);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Скачать исходный файл шаблона' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.presentationml.presentation')
  async file(@Param('id', { schema: z.uuid() }) id: string) {
    const { data, fileName } = await this.templates.file(id);
    return new StreamableFile(data, {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      disposition: `attachment; filename="template.pptx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
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
    return new StreamableFile(await this.previews.read(`templates/${id}`, n), {
      type: 'image/png',
    });
  }
}
