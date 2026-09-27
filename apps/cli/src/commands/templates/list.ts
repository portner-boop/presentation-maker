import type { Template } from '@pm/shared';
import { ApiCommand } from '../../base-command.js';
import { shortDate, table } from '../../format.js';

export default class TemplatesList extends ApiCommand {
  static description = 'Список шаблонов и статус их обработки';

  async run(): Promise<Template[]> {
    const { flags } = await this.parse(TemplatesList);
    const templates = await this.client(flags['api-url']).templates.list();
    if (templates.length === 0) {
      this.log('Шаблонов пока нет. Загрузи: pm templates upload <file.pptx>');
      return templates;
    }
    this.log(
      table(templates, {
        ID: (t) => t.id,
        STATUS: (t) => t.status,
        NAME: (t) => t.name,
        CREATED: (t) => shortDate(t.createdAt),
      }),
    );
    return templates;
  }
}
