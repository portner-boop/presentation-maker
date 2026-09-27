import type { Presentation } from '@pm/shared';
import { ApiCommand } from '../../base-command.js';
import { shortDate, table } from '../../format.js';

export default class PresentationsList extends ApiCommand {
  static description = 'Список презентаций';

  async run(): Promise<Presentation[]> {
    const { flags } = await this.parse(PresentationsList);
    const presentations = await this.client(flags['api-url']).presentations.list();
    if (presentations.length === 0) {
      this.log('Презентаций пока нет. Создай: pm presentations create -t <template-id> -b "..."');
      return presentations;
    }
    this.log(
      table(presentations, {
        ID: (p) => p.id,
        STATUS: (p) => p.status,
        SLIDES: (p) => String(p.slides?.length ?? '-'),
        TITLE: (p) => p.title ?? p.brief.slice(0, 40),
        CREATED: (p) => shortDate(p.createdAt),
      }),
    );
    return presentations;
  }
}
