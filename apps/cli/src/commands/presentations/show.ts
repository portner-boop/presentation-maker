import { Args } from '@oclif/core';
import type { Presentation } from '@pm/shared';
import { ApiCommand } from '../../base-command.js';
import { formatSlides } from '../../format.js';

export default class PresentationsShow extends ApiCommand {
  static description = 'Слайды и текст спикера';

  static args = {
    id: Args.string({ description: 'id презентации', required: true }),
  };

  async run(): Promise<Presentation> {
    const { args, flags } = await this.parse(PresentationsShow);
    const presentation = await this.client(flags['api-url']).presentations.get(args.id);

    this.log(`${presentation.title ?? presentation.brief.slice(0, 80)}`);
    this.log(`status: ${presentation.status}`);
    if (presentation.error) this.log(`error: ${presentation.error}`);
    if (presentation.status === 'READY') this.log(`\n${formatSlides(presentation)}`);
    return presentation;
  }
}
