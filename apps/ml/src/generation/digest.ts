import type { SourceFile } from '@pm/shared';

/**
 * Детерминированная выжимка материалов для планировщика: сначала документация, потом манифесты,
 * дерево файлов и начала исходников. Суммаризация репозитория через LLM съела бы бюджет в 5 минут.
 */
export function buildDigest(sources: SourceFile[], maxChars = 40_000): string {
  if (sources.length === 0) return '';
  const ranked = [...sources].sort(
    (a, b) => rank(a.path) - rank(b.path) || a.path.length - b.path.length,
  );
  const parts: string[] = [];
  let used = 0;

  const push = (text: string) => {
    const room = maxChars - used;
    if (room <= 200) return false;
    const chunk = text.length > room ? `${text.slice(0, room)}\n…` : text;
    parts.push(chunk);
    used += chunk.length;
    return true;
  };

  const docs = ranked.filter((f) => rank(f.path) <= 2);
  for (const file of docs) {
    if (!push(`### ${file.path}\n${file.content.trim().slice(0, 12_000)}`)) break;
  }

  const tree = sources
    .map((f) => f.path)
    .sort()
    .slice(0, 400)
    .join('\n');
  push(`### Структура файлов (${sources.length})\n${tree}`);

  for (const file of ranked.filter((f) => rank(f.path) > 2)) {
    const head = file.content.split('\n').slice(0, 60).join('\n');
    if (!push(`### ${file.path} (начало)\n${head}`)) break;
  }
  return parts.join('\n\n');
}

function rank(path: string): number {
  const lower = path.toLowerCase();
  const name = lower.split('/').pop() ?? lower;
  if (/^readme(\.|$)/.test(name) && !lower.includes('/')) return 0;
  if (/^readme(\.|$)/.test(name) || lower.startsWith('docs/') || /\.(md|mdx|txt)$/.test(name))
    return 1;
  if (['package.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'schema.prisma'].includes(name))
    return 2;
  if (/(^|\/)(src|apps|packages|lib)\//.test(lower)) return 3;
  return 4;
}
