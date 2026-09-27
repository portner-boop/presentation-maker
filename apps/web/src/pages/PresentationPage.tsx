import { ActionIcon, Button, CopyButton, SegmentedControl, Skeleton, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { GENERATION_TIME_BUDGET_MS, type Presentation, type Slide } from '@pm/shared';
import { useHead } from '@unhead/react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Plus,
  RotateCw,
} from 'lucide-react';
import { parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { Link, useParams } from 'react-router';
import { urls } from '../api/client';
import { usePresentation, useRetryPresentation, useTemplate } from '../api/queries';
import { Elapsed } from '../components/Elapsed';
import { describeError, ErrorState } from '../components/ErrorState';
import { Page } from '../components/Page';
import { PageHeader } from '../components/PageHeader';
import { SlideImage, usePrefetch } from '../components/slides/SlideImage';
import { StatusBadge } from '../components/StatusBadge';
import {
  ago,
  clock,
  KIND_LABELS,
  presentationName,
  progressShare,
  seconds,
  slidesLabel,
  stageLabel,
} from '../lib/format';
import classes from './PresentationPage.module.css';

const VIEWS = ['slides', 'script'] as const;

export function PresentationPage() {
  const { id } = useParams();
  const presentation = usePresentation(id);
  const p = presentation.data;
  const template = useTemplate(p?.templateId);
  useHead({ title: p ? presentationName(p) : 'Презентация' });

  if (presentation.isPending) {
    return (
      <Page wide>
        <Skeleton height={20} width={160} mb="md" />
        <Skeleton height={36} width="50%" mb={40} />
        <Skeleton height={420} radius="lg" />
      </Page>
    );
  }

  if (presentation.isError || !p) {
    return (
      <Page>
        <PageHeader trail={[{ label: 'Презентации', to: '/' }]} title="Презентация" />
        <ErrorState
          error={presentation.error}
          title="Не удалось открыть презентацию"
          onRetry={() => presentation.refetch()}
        />
      </Page>
    );
  }

  const ready = p.status === 'READY';
  const meta = (
    <>
      <StatusBadge kind="presentation" status={p.status} />
      {template.data && (
        <Link to={`/templates/${template.data.id}`} className={classes.metaLink}>
          {template.data.name}
        </Link>
      )}
      {p.durationMinutes && <span>{p.durationMinutes} мин выступления</span>}
      {p.slides && <span>{slidesLabel(p.slides.length)}</span>}
      {p.stats && <span>собрана за {seconds(p.stats.totalMs)}</span>}
      <span>{ago(p.createdAt)}</span>
    </>
  );

  return (
    <Page wide>
      <PageHeader
        trail={[{ label: 'Презентации', to: '/' }]}
        title={presentationName(p)}
        meta={meta}
        actions={
          ready ? (
            <>
              <Button
                component="a"
                href={urls.presentationFile(p.id)}
                download
                leftSection={<Download size={18} strokeWidth={2} />}
              >
                Скачать .pptx
              </Button>
              <Button
                component="a"
                href={urls.presentationScript(p.id)}
                download
                variant="default"
                leftSection={<FileText size={18} strokeWidth={1.75} />}
              >
                Текст .md
              </Button>
            </>
          ) : null
        }
      />

      {p.status === 'FAILED' ? (
        <FailedPanel presentation={p} />
      ) : !ready ? (
        <ProgressPanel presentation={p} />
      ) : (
        <ReadyView presentation={p} aspect={aspectOf(template.data?.profile?.slideSize)} />
      )}
    </Page>
  );
}

function aspectOf(size?: { widthEmu: number; heightEmu: number }): number {
  return size ? size.heightEmu / size.widthEmu : 9 / 16;
}

/* ─── Идёт генерация ─────────────────────────────────────────────────────── */

function ProgressPanel({ presentation: p }: { presentation: Presentation }) {
  const share = progressShare(p.status, p.progress);
  const stage = p.progress?.stage;
  const steps = [
    ...(p.gitUrl ? [{ key: 'sources', label: 'Материалы', detail: 'Клонируем репозиторий' }] : []),
    { key: 'plan', label: 'План', detail: 'Структура выступления и макеты' },
    {
      key: 'compose',
      label: 'Слайды',
      detail:
        p.progress?.stage === 'compose' && p.progress.total
          ? `${p.progress.done ?? 0} из ${p.progress.total}`
          : 'Текст и речь спикера',
    },
    { key: 'render', label: 'Сборка', detail: 'Клонируем слайды шаблона в .pptx' },
  ];
  const order = steps.map((s) => s.key);
  const current = p.status === 'PENDING' ? -1 : stage ? order.indexOf(stage) : 0;

  return (
    <section className={classes.progress} aria-live="polite">
      <div className={classes.progressHead}>
        <div>
          <p className={classes.progressStage}>
            {p.status === 'PENDING' ? 'В очереди' : stageLabel(p.progress)}
          </p>
          <p className={classes.progressHint}>Можно уйти со страницы — генерация продолжится.</p>
        </div>
        <p className={classes.progressTime}>
          <Elapsed since={p.createdAt} running />
          <span> из {clock(GENERATION_TIME_BUDGET_MS / 1000)}</span>
        </p>
      </div>
      <div
        className={classes.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        aria-label="Прогресс генерации"
      >
        <span style={{ transform: `scaleX(${share})` }} />
      </div>
      <ol className={classes.steps}>
        {steps.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'next';
          return (
            <li key={step.key} data-state={state}>
              <span className={classes.stepMark} aria-hidden>
                {state === 'done' ? <Check size={14} strokeWidth={2.5} /> : i + 1}
              </span>
              <span>
                <span className={classes.stepLabel}>{step.label}</span>
                <span className={classes.stepDetail}>{step.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <details className={classes.brief}>
        <summary>Задача</summary>
        <p>{p.brief}</p>
      </details>
    </section>
  );
}

/* ─── Ошибка ─────────────────────────────────────────────────────────────── */

function FailedPanel({ presentation: p }: { presentation: Presentation }) {
  const retry = useRetryPresentation();
  return (
    <ErrorState error={new Error(p.error ?? 'Причина не записана')} title="Генерация не удалась">
      <Button
        size="sm"
        leftSection={<RotateCw size={16} strokeWidth={2} />}
        loading={retry.isPending}
        onClick={() =>
          retry.mutate(p.id, {
            onError: (error) =>
              notifications.show({
                title: 'Не удалось перезапустить',
                message: describeError(error),
                color: 'red',
              }),
          })
        }
      >
        Запустить снова
      </Button>
      <Button
        size="sm"
        variant="default"
        component={Link}
        to="/presentations/new"
        leftSection={<Plus size={16} strokeWidth={1.75} />}
      >
        Новая презентация
      </Button>
    </ErrorState>
  );
}

/* ─── Готово: режим спикера ──────────────────────────────────────────────── */

function ReadyView({ presentation: p, aspect }: { presentation: Presentation; aspect: number }) {
  const slides = p.slides ?? [];
  const [view, setView] = useQueryState('view', parseAsStringLiteral(VIEWS).withDefault('slides'));
  const [slideParam, setSlideParam] = useQueryState('slide', parseAsInteger.withDefault(1));
  const index = Math.min(Math.max(slideParam, 1), Math.max(slides.length, 1)) - 1;
  const go = (next: number) =>
    setSlideParam(Math.min(Math.max(next, 0), slides.length - 1) + 1, { history: 'replace' });
  const slideSrc = (i: number) =>
    p.previewCount && i >= 0 && i < p.previewCount
      ? urls.presentationSlide(p.id, i + 1, p.updatedAt)
      : null;
  usePrefetch([slideSrc(index + 1), slideSrc(index - 1)]);

  useHotkeys([
    ['ArrowRight', () => view === 'slides' && go(index + 1)],
    ['ArrowLeft', () => view === 'slides' && go(index - 1)],
  ]);

  const totalSeconds = slides.reduce((sum, s) => sum + s.durationSeconds, 0);
  const slide = slides[index];

  return (
    <>
      <div className={classes.toolbar}>
        <SegmentedControl
          value={view}
          onChange={(value) => setView(value as (typeof VIEWS)[number])}
          data={[
            { value: 'slides', label: 'Слайды' },
            { value: 'script', label: 'Текст выступления' },
          ]}
          aria-label="Режим просмотра"
        />
        <span className={classes.toolbarMeta}>
          Речь на {clock(totalSeconds)} · {countWords(slides)} слов
        </span>
      </div>

      {view === 'script' ? (
        <ScriptView
          slides={slides}
          onOpenSlide={(i) => {
            setView('slides');
            go(i);
          }}
        />
      ) : (
        <div className={classes.speaker}>
          <nav className={classes.rail} aria-label="Слайды">
            <ol>
              {slides.map((s, i) => (
                <li key={s.index}>
                  <button
                    type="button"
                    className={classes.railItem}
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => go(i)}
                  >
                    <span className={classes.railThumb}>
                      <SlideImage
                        src={slideSrc(i)}
                        aspect={aspect}
                        alt=""
                        fallback={s}
                        size="thumb"
                      />
                      <span className={classes.railNumber}>{i + 1}</span>
                    </span>
                    <span className={classes.railText}>
                      <span className={classes.railTitle}>{s.title}</span>
                      <span className={classes.railMeta}>
                        {KIND_LABELS[s.kind]} · {clock(s.durationSeconds)}
                        {s.warnings.length > 0 && (
                          <AlertTriangle
                            size={12}
                            strokeWidth={2}
                            aria-label="Есть предупреждения"
                          />
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className={classes.stage}>
            {slide && (
              <SlideImage
                src={slideSrc(index)}
                aspect={aspect}
                alt={`Слайд ${index + 1}: ${slide.title}`}
                fallback={slide}
              />
            )}
            <div className={classes.stageNav}>
              <Tooltip label="Предыдущий слайд · ←">
                <ActionIcon
                  variant="default"
                  size="lg"
                  onClick={() => go(index - 1)}
                  disabled={index === 0}
                  aria-label="Предыдущий слайд"
                >
                  <ChevronLeft size={18} strokeWidth={2} />
                </ActionIcon>
              </Tooltip>
              <span className={classes.counter}>
                {index + 1} / {slides.length}
              </span>
              <Tooltip label="Следующий слайд · →">
                <ActionIcon
                  variant="default"
                  size="lg"
                  onClick={() => go(index + 1)}
                  disabled={index >= slides.length - 1}
                  aria-label="Следующий слайд"
                >
                  <ChevronRight size={18} strokeWidth={2} />
                </ActionIcon>
              </Tooltip>
            </div>
          </div>

          {slide && <SpeakerNotes slide={slide} />}
        </div>
      )}
    </>
  );
}

function SpeakerNotes({ slide }: { slide: Slide }) {
  return (
    <aside className={classes.notes} aria-label="Текст спикера">
      <div className={classes.notesHead}>
        <h2 className={classes.notesTitle}>Текст спикера</h2>
        <span className={classes.timing}>{clock(slide.durationSeconds)}</span>
        <CopyButton value={slide.speakerNotes} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Скопировано' : 'Копировать'}>
              <ActionIcon onClick={copy} aria-label="Копировать текст спикера" size="md">
                {copied ? (
                  <Check size={16} strokeWidth={2} />
                ) : (
                  <Copy size={16} strokeWidth={1.75} />
                )}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </div>
      <p className={classes.notesText}>
        {slide.speakerNotes || 'Для этого слайда текст не сгенерирован.'}
      </p>
      {slide.warnings.length > 0 && (
        <ul className={classes.warnings}>
          {slide.warnings.map((w) => (
            <li key={w}>
              <AlertTriangle size={14} strokeWidth={2} aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function ScriptView({
  slides,
  onOpenSlide,
}: {
  slides: Slide[];
  onOpenSlide: (index: number) => void;
}) {
  const full = slides.map((s) => `${s.index + 1}. ${s.title}\n\n${s.speakerNotes}`).join('\n\n');
  return (
    <div className={classes.script}>
      <div className={classes.scriptActions}>
        <CopyButton value={full} timeout={1500}>
          {({ copied, copy }) => (
            <Button
              variant="default"
              size="sm"
              onClick={copy}
              leftSection={
                copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.75} />
              }
            >
              {copied ? 'Скопировано' : 'Скопировать весь текст'}
            </Button>
          )}
        </CopyButton>
      </div>
      <ol className={classes.scriptList}>
        {slides.map((s, i) => (
          <li key={s.index} className={classes.scriptItem}>
            <div className={classes.scriptHead}>
              <button type="button" className={classes.scriptTitle} onClick={() => onOpenSlide(i)}>
                <span className={classes.railNumber}>{i + 1}</span>
                {s.title}
              </button>
              <span className={classes.timing}>{clock(s.durationSeconds)}</span>
            </div>
            <p className={classes.scriptText}>{s.speakerNotes}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function countWords(slides: Slide[]): number {
  return slides.reduce((sum, s) => sum + s.speakerNotes.split(/\s+/).filter(Boolean).length, 0);
}
