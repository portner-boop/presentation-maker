import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Args, Flags } from '@oclif/core';
import { MAX_TEMPLATE_SIZE_BYTES, TEMPLATE_FILE_EXTENSIONS, type Template } from '@pm/shared';
import { ApiCommand } from '../../base-command.js';

export default class TemplatesUpload extends ApiCommand {
  static description =
    'Загрузить шаблон (.pptx/.potx). Api поставит его в очередь на «обучение», после READY по нему можно генерировать';

  static examples = ['<%= config.bin %> <%= command.id %> ./brand.pptx --name "Хакатон" --wait'];

  static args = {
    file: Args.string({ description: 'Путь к .pptx или .potx', required: true }),
  };

  static flags = {
    name: Flags.string({ char: 'n', description: 'Название шаблона (по умолчанию имя файла)' }),
    wait: Flags.boolean({ char: 'w', description: 'Дождаться окончания обработки' }),
  };

  async run(): Promise<Template> {
    const { args, flags } = await this.parse(TemplatesUpload);

    const ext = extname(args.file).toLowerCase();
    if (!(TEMPLATE_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
      this.error(`Нужен ${TEMPLATE_FILE_EXTENSIONS.join(' или ')}, а не "${ext}"`);
    }
    const { size } = await stat(args.file);
    if (size > MAX_TEMPLATE_SIZE_BYTES) {
      this.error(`Файл больше ${MAX_TEMPLATE_SIZE_BYTES / 1024 / 1024} МБ`);
    }

    const api = this.client(flags['api-url']);
    let template = await api.templates.upload({
      file: await openAsBlob(args.file),
      fileName: basename(args.file),
      name: flags.name,
    });
    this.log(`Шаблон ${template.id} поставлен в очередь`);

    if (flags.wait) {
      template = await this.waitFor('Обучаемся на шаблоне', () => api.templates.get(template.id));
      if (template.status === 'FAILED') this.error(`Обработка упала: ${template.error}`);
      this.log(`Готово, шаблон доступен для генерации: ${template.id}`);
    }
    return template;
  }
}
