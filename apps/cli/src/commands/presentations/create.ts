import { readFile } from 'node:fs/promises';
import { Flags } from '@oclif/core';
import type { Presentation } from '@pm/shared';
import { ApiCommand } from '../../base-command.js';
import { formatSlides, formatStats } from '../../format.js';
import { collectSources } from '@pm/shared/node';

export default class PresentationsCreate extends ApiCommand {
  static description = 'Сгенерировать презентацию и текст спикера по готовому шаблону';

  static examples = [
    '<%= config.bin %> <%= command.id %> -t <template-id> -b "Финал хакатона" -s . -d 7 -o final.pptx',
    '<%= config.bin %> <%= command.id %> -t <template-id> -f ./brief.md -s https://github.com/org/repo -s ./docs.zip --wait',
  ];

  static flags = {
    template: Flags.string({ char: 't', description: 'id готового шаблона', required: true }),
    brief: Flags.string({
      char: 'b',
      description: 'Задача текстом',
      exactlyOne: ['brief', 'brief-file'],
    }),
    'brief-file': Flags.file({ char: 'f', description: 'Задача из файла', exists: true }),
    source: Flags.string({
      char: 's',
      description: 'Материалы: папка, .zip, git-ссылка или файл. Можно несколько раз',
      multiple: true,
    }),
    duration: Flags.integer({
      char: 'd',
      description: 'Лимит выступления, минут',
      min: 1,
      max: 120,
    }),
    wait: Flags.boolean({ char: 'w', description: 'Дождаться генерации и вывести слайды' }),
    out: Flags.string({
      char: 'o',
      description: 'Сохранить .pptx (и .md с текстом выступления рядом)',
    }),
  };

  async run(): Promise<Presentation> {
    const { flags } = await this.parse(PresentationsCreate);
    const brief = flags.brief ?? (await readFile(flags['brief-file']!, 'utf8'));

    let sources;
    if (flags.source?.length) {
      const collected = await collectSources(flags.source);
      sources = collected.files;
      this.log(
        `Материалы: ${collected.files.length} файлов, ${Math.round(collected.totalChars / 1000)}k символов` +
          (collected.truncated ? ' (обрезано по лимиту)' : ''),
      );
    }

    const api = this.client(flags['api-url']);
    let presentation = await api.presentations.create({
      templateId: flags.template,
      brief,
      durationMinutes: flags.duration,
      sources,
    });
    this.log(`Презентация ${presentation.id} поставлена в очередь`);

    if (flags.wait || flags.out) {
      presentation = await this.waitFor('Генерируем', () => api.presentations.get(presentation.id));
      if (presentation.status === 'FAILED') this.error(`Генерация упала: ${presentation.error}`);
      this.log(`\n${presentation.title ?? ''}\n\n${formatSlides(presentation)}`);
      if (presentation.stats) this.log(`\n${formatStats(presentation.stats)}`);
      if (flags.out) await this.download(api, presentation.id, flags.out);
    }
    return presentation;
  }
}
