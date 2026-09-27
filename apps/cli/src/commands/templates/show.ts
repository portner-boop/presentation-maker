import { Args } from '@oclif/core';
import type { Template } from '@pm/shared';
import { ApiCommand } from '../../base-command.js';

export default class TemplatesShow extends ApiCommand {
  static description = 'Шаблон, статус обучения и выделенный профиль бренда';

  static args = {
    id: Args.string({ description: 'id шаблона', required: true }),
  };

  async run(): Promise<Template> {
    const { args, flags } = await this.parse(TemplatesShow);
    const template = await this.client(flags['api-url']).templates.get(args.id);

    this.log(`${template.name} (${template.fileName})`);
    this.log(`status: ${template.status}`);
    if (template.error) this.log(`error: ${template.error}`);
    if (template.profile) {
      const { colors, fonts, layouts, tone, warnings } = template.profile;
      this.log(`colors: ${colors.join(', ')}`);
      this.log(`fonts: ${fonts.heading} / ${fonts.body}`);
      this.log(`layouts (${layouts.length}):`);
      for (const layout of layouts) {
        const slots = layout.slots
          .map((s) => `${s.key} ${s.charsPerLine}×${s.maxLines}`)
          .join(', ');
        this.log(
          `  слайд ${layout.sourceSlide}: ${layout.kind}${layout.hasImage ? ' + картинка' : ''} — ${slots}`,
        );
      }
      if (tone) this.log(`tone: ${tone}`);
      for (const warning of warnings) this.log(`⚠ ${warning}`);
    }
    return template;
  }
}
