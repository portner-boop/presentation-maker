import { Args, Flags } from '@oclif/core';
import { ApiCommand } from '../../base-command.js';

export default class PresentationsDownload extends ApiCommand {
  static description = 'Скачать готовый .pptx и текст выступления (.md рядом)';

  static args = {
    id: Args.string({ description: 'id презентации', required: true }),
  };

  static flags = {
    out: Flags.string({
      char: 'o',
      description: 'Куда сохранить .pptx',
      default: 'presentation.pptx',
    }),
  };

  async run(): Promise<{ pptx: string; script: string }> {
    const { args, flags } = await this.parse(PresentationsDownload);
    return this.download(this.client(flags['api-url']), args.id, flags.out);
  }
}
