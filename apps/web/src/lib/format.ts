import type { GenerationProgress, LayoutKind, Presentation, Template } from '@pm/shared';

const plural = new Intl.PluralRules('ru');

/** plural(5, ['слайд', 'слайда', 'слайдов']) → «5 слайдов». */
export function pluralize(n: number, [one, few, many]: [string, string, string]): string {
  const form = plural.select(n);
  return `${n} ${form === 'one' ? one : form === 'few' ? few : many}`;
}

export const slidesLabel = (n: number) => pluralize(n, ['слайд', 'слайда', 'слайдов']);
export const layoutsLabel = (n: number) => pluralize(n, ['макет', 'макета', 'макетов']);
export const filesLabel = (n: number) => pluralize(n, ['файл', 'файла', 'файлов']);

/** 83 → «1:23», для таймеров и тайминга слайдов. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} с`;
}

const relative = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function ago(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'только что';
  if (abs < 3_600) return relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(diff / 3_600), 'hour');
  return dateFormat.format(new Date(iso));
}

export function compactNumber(n: number): string {
  return n >= 1_000 ? `${Math.round(n / 100) / 10}k` : String(n);
}

export const KIND_LABELS: Record<LayoutKind, string> = {
  title: 'Титул',
  section: 'Разделитель',
  bullets: 'Тезисы',
  text: 'Текст',
  'two-column': 'Две колонки',
  cards: 'Карточки',
  'image-text': 'Картинка и текст',
  closing: 'Финал',
  other: 'Свободный',
};

export const TEMPLATE_STATUS: Record<Template['status'], string> = {
  PENDING: 'В очереди',
  PROCESSING: 'Обучение',
  READY: 'Готов',
  FAILED: 'Ошибка',
};

export const PRESENTATION_STATUS: Record<Presentation['status'], string> = {
  PENDING: 'В очереди',
  GENERATING: 'Генерация',
  READY: 'Готова',
  FAILED: 'Ошибка',
};

export function stageLabel(progress: GenerationProgress | null | undefined): string {
  if (!progress) return 'Запускаем';
  switch (progress.stage) {
    case 'sources':
      return 'Клонируем репозиторий';
    case 'plan':
      return 'Составляем план';
    case 'compose':
      return progress.total ? `Слайды ${progress.done ?? 0} из ${progress.total}` : 'Пишем слайды';
    case 'render':
      return 'Собираем .pptx';
  }
}

/** Приблизительная доля готовности для полосы прогресса: план ~35%, слайды ~60%, сборка — остаток. */
export function progressShare(
  status: Presentation['status'],
  progress: GenerationProgress | null,
): number {
  if (status === 'READY') return 1;
  if (status === 'PENDING' || !progress) return 0.03;
  switch (progress.stage) {
    case 'sources':
      return 0.06;
    case 'plan':
      return 0.15;
    case 'compose':
      return 0.35 + 0.6 * ((progress.done ?? 0) / (progress.total ?? 1));
    case 'render':
      return 0.97;
  }
}

/** Пока генерация идёт, названия ещё нет — показываем начало задачи, обрезанное по слову. */
export function presentationName(p: Pick<Presentation, 'title' | 'brief'>): string {
  if (p.title?.trim()) return p.title.trim();
  const line = p.brief.split('\n')[0].trim();
  if (line.length <= 80) return line;
  return `${line
    .slice(0, 80)
    .replace(/\s+\S*$/, '')
    .replace(/[,.;:—-]+$/, '')}…`;
}
