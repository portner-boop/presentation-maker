import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Flags, ux } from '@oclif/core';
import { GENERATION_TIME_BUDGET_MS, type Presentation } from '@pm/shared';
import { ApiCommand } from '../base-command.js';
import { formatStats, table } from '../format.js';
import { collectSources } from '@pm/shared/node';

interface BenchResult {
  wallMs: number;
  withinBudget: boolean;
  presentations: Presentation[];
}

export default class Bench extends ApiCommand {
  static description =
    'Проверка главного требования: N презентаций параллельно (по умолчанию 3) должны уложиться в 5 минут';

  static examples = [
    '<%= config.bin %> <%= command.id %> -t <template-id> -b "Финал хакатона" -s . -d 7 --out-dir ./bench',
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
      description: 'Материалы: папка, .zip, git-ссылка или файл',
      multiple: true,
    }),
    duration: Flags.integer({ char: 'd', description: 'Лимит выступления, минут', default: 7 }),
    count: Flags.integer({
      char: 'n',
      description: 'Сколько презентаций параллельно',
      default: 3,
      min: 1,
      max: 10,
    }),
    'out-dir': Flags.string({ description: 'Сохранить .pptx и .md всех презентаций в папку' }),
  };

  async run(): Promise<BenchResult> {
    const { flags } = await this.parse(Bench);
    const brief = flags.brief ?? (await readFile(flags['brief-file']!, 'utf8'));
    const sources = flags.source?.length ? (await collectSources(flags.source)).files : undefined;
    const api = this.client(flags['api-url']);

    // время считается от первого запроса до последней готовой презентации, как увидит пользователь
    const startedAt = Date.now();
    const created = await Promise.all(
      Array.from({ length: flags.count }, () =>
        api.presentations.create({
          templateId: flags.template,
          brief,
          durationMinutes: flags.duration,
          sources,
        }),
      ),
    );

    ux.action.start(`Генерируем ${flags.count} презентации параллельно`);
    const done = new Map<string, number>();
    let presentations = created;
    for (;;) {
      presentations = await Promise.all(created.map((p) => api.presentations.get(p.id)));
      for (const p of presentations) {
        if ((p.status === 'READY' || p.status === 'FAILED') && !done.has(p.id))
          done.set(p.id, Date.now() - startedAt);
      }
      ux.action.status = `${done.size}/${flags.count}, ${Math.round((Date.now() - startedAt) / 1000)}s`;
      if (done.size === presentations.length) break;
      if (Date.now() - startedAt > GENERATION_TIME_BUDGET_MS * 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    ux.action.stop();

    const wallMs = Math.max(...done.values(), Date.now() - startedAt);
    const withinBudget =
      presentations.every((p) => p.status === 'READY') && wallMs <= GENERATION_TIME_BUDGET_MS;

    this.log(
      table(presentations, {
        ID: (p) => p.id.slice(0, 8),
        STATUS: (p) => p.status,
        SLIDES: (p) => String(p.slides?.length ?? '-'),
        READY_AT: (p) => (done.has(p.id) ? `${(done.get(p.id)! / 1000).toFixed(1)}s` : '-'),
        WARNINGS: (p) => String(p.slides?.reduce((n, s) => n + s.warnings.length, 0) ?? '-'),
        TITLE: (p) => (p.title ?? p.error ?? '').slice(0, 50),
      }),
    );
    for (const p of presentations)
      if (p.stats) this.log(`${p.id.slice(0, 8)}: ${formatStats(p.stats)}`);
    this.log(
      `\nИтого: ${(wallMs / 1000).toFixed(1)}s из ${GENERATION_TIME_BUDGET_MS / 1000}s — ${withinBudget ? 'укладываемся ✅' : 'НЕ укладываемся ❌'}`,
    );

    if (flags['out-dir']) {
      await mkdir(flags['out-dir'], { recursive: true });
      for (const [i, p] of presentations.entries()) {
        if (p.status === 'READY')
          await this.download(api, p.id, join(flags['out-dir'], `presentation-${i + 1}.pptx`));
      }
    }
    return { wallMs, withinBudget, presentations };
  }
}
