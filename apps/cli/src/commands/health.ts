import type { Health } from '@pm/shared';
import { ApiCommand } from '../base-command.js';

export default class HealthCommand extends ApiCommand {
  static description = 'Проверить, что api, БД и Redis живы';

  async run(): Promise<Health> {
    const { flags } = await this.parse(HealthCommand);
    const health = await this.client(flags['api-url']).health();
    this.log(`api: ${health.status}, db: ${health.db}, redis: ${health.redis}`);
    return health;
  }
}
