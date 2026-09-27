import { writeFile } from 'node:fs/promises';
import { Command, Flags, type Interfaces, ux } from '@oclif/core';
import { ApiError, type ApiClient, createApiClient } from '@pm/shared';

/** Общая база команд, которые ходят в api: флаг --api-url, --json и понятные ошибки. */
export abstract class ApiCommand extends Command {
  static baseFlags = {
    'api-url': Flags.string({
      description: 'Адрес api',
      env: 'PM_API_URL',
      default: 'http://localhost:3000',
      helpGroup: 'GLOBAL',
    }),
  };

  static enableJsonFlag = true;

  protected client(apiUrl: string): ApiClient {
    return createApiClient({ baseUrl: apiUrl });
  }

  /** Опрашивает api, пока задача в очереди не дойдёт до финального статуса. */
  protected async waitFor<T extends { status: string }>(
    label: string,
    fetch: () => Promise<T>,
    { intervalMs = 1_000, timeoutMs = 10 * 60_000 } = {},
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    ux.action.start(label);
    try {
      for (;;) {
        const item = await fetch();
        ux.action.status = item.status;
        if (item.status === 'READY' || item.status === 'FAILED') return item;
        if (Date.now() > deadline) this.error(`Не дождались за ${timeoutMs / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    } finally {
      ux.action.stop();
    }
  }

  /** Сохраняет .pptx и рядом .md с текстом выступления. */
  protected async download(
    api: ApiClient,
    id: string,
    out: string,
  ): Promise<{ pptx: string; script: string }> {
    const pptx = out.endsWith('.pptx') ? out : `${out}.pptx`;
    const script = pptx.replace(/\.pptx$/, '.md');
    const [file, text] = await Promise.all([
      api.presentations.file(id),
      api.presentations.script(id),
    ]);
    await Promise.all([writeFile(pptx, file), writeFile(script, text)]);
    this.log(`Сохранено: ${pptx}, ${script}`);
    return { pptx, script };
  }

  protected async catch(error: Interfaces.CommandError): Promise<unknown> {
    if (error instanceof ApiError) this.error(`api ответил ${error.status}: ${error.message}`);
    if (error instanceof TypeError && error.message === 'fetch failed') {
      this.error(
        'api недоступен. Он запущен? (pnpm dev) Адрес меняется через --api-url или PM_API_URL',
      );
    }
    return super.catch(error);
  }
}
