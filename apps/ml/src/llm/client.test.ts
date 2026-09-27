import { describe, expect, it } from 'vitest';
import { parseJson } from './client.js';
import { Semaphore } from './semaphore.js';

describe('parseJson', () => {
  it('достаёт JSON из ```json-блока и текста вокруг', () => {
    expect(parseJson('Вот ответ:\n```json\n{"a": 1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson('ok {"a": [1, 2]} done')).toEqual({ ok: true, value: { a: [1, 2] } });
  });

  it('не падает на мусоре', () => {
    expect(parseJson('не json')).toEqual({ ok: false });
    expect(parseJson('{"a": ')).toEqual({ ok: false });
  });
});

describe('Semaphore', () => {
  it('не пускает больше limit задач одновременно', async () => {
    const semaphore = new Semaphore(3);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        semaphore.run(async () => {
          peak = Math.max(peak, ++active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(3);
  });
});
