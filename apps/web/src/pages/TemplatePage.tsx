import { Button, Skeleton } from '@mantine/core';
import { type Layout, slotGroup, slotGroupLabel, type Template } from '@pm/shared';
import { useHead } from '@unhead/react';
import { AlertTriangle, ArrowRight, ImageIcon } from 'lucide-react';
import { useParams } from 'react-router';
import { Link } from 'react-router';
import { urls } from '../api/client';
import { useTemplate } from '../api/queries';
import { ErrorState } from '../components/ErrorState';
import { Page, Section } from '../components/Page';
import { PageHeader } from '../components/PageHeader';
import { SlideImage } from '../components/slides/SlideImage';
import { StatusBadge } from '../components/StatusBadge';
import { Swatches } from '../components/Swatches';
import { ago, KIND_LABELS, layoutsLabel } from '../lib/format';
import classes from './TemplatePage.module.css';

export function TemplatePage() {
  const { id } = useParams();
  const template = useTemplate(id);
  const t = template.data;
  useHead({ title: t?.name ?? 'Шаблон' });

  if (template.isPending) {
    return (
      <Page>
        <Skeleton height={20} width={120} mb="md" />
        <Skeleton height={36} width="40%" mb={40} />
        <Skeleton height={320} radius="lg" />
      </Page>
    );
  }

  if (template.isError || !t) {
    return (
      <Page>
        <PageHeader trail={[{ label: 'Шаблоны', to: '/templates' }]} title="Шаблон" />
        <ErrorState
          error={template.error}
          title="Не удалось открыть шаблон"
          onRetry={() => template.refetch()}
        />
      </Page>
    );
  }

  const profile = t.profile;
  return (
    <Page>
      <PageHeader
        trail={[{ label: 'Шаблоны', to: '/templates' }]}
        title={t.name}
        meta={
          <>
            <StatusBadge kind="template" status={t.status} />
            <span>{t.fileName}</span>
            {profile && <span>{layoutsLabel(profile.layouts.length)}</span>}
            <span>загружен {ago(t.createdAt)}</span>
          </>
        }
        actions={
          t.status === 'READY' && (
            <Button
              component={Link}
              to={`/presentations/new?template=${t.id}`}
              rightSection={<ArrowRight size={18} strokeWidth={2} />}
            >
              Создать презентацию
            </Button>
          )
        }
      />

      {t.status === 'FAILED' ? (
        <ErrorState
          error={new Error(t.error ?? 'Причина не записана')}
          title="Анализ шаблона не удался"
        >
          <Button size="sm" variant="default" component={Link} to="/templates">
            Загрузить другой файл
          </Button>
        </ErrorState>
      ) : t.status !== 'READY' || !profile ? (
        <Analyzing template={t} />
      ) : (
        <>
          <Section title="Бренд" description="Взято из темы и реального использования на слайдах.">
            <div className={classes.brand}>
              <div className={classes.brandBlock}>
                <h3 className={classes.blockTitle}>Палитра</h3>
                <Swatches colors={profile.colors} />
              </div>
              <div className={classes.brandBlock}>
                <h3 className={classes.blockTitle}>Шрифты</h3>
                <dl className={classes.fonts}>
                  <dt>Заголовки</dt>
                  <dd>{profile.fonts.heading}</dd>
                  <dt>Текст</dt>
                  <dd>{profile.fonts.body}</dd>
                </dl>
              </div>
              {profile.tone && (
                <div className={`${classes.brandBlock} ${classes.toneBlock}`}>
                  <h3 className={classes.blockTitle}>Тон</h3>
                  <Tone text={profile.tone} />
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Макеты"
            description="Слайды шаблона, из которых собираются презентации. Размер поля — сколько символов влезает в строку и сколько строк."
          >
            <LayoutList
              template={t}
              layouts={profile.layouts}
              aspect={profile.slideSize.heightEmu / profile.slideSize.widthEmu}
            />
          </Section>

          {profile.warnings.length > 0 && (
            <Section title="Что учесть">
              <ul className={classes.warnings}>
                {profile.warnings.map((w) => (
                  <li key={w}>
                    <AlertTriangle size={16} strokeWidth={1.75} aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}

function Analyzing({ template }: { template: Template }) {
  return (
    <section className={classes.analyzing} aria-live="polite">
      <div className={classes.analyzingTrack}>
        <span />
      </div>
      <p className={classes.analyzingTitle}>
        {template.status === 'PENDING' ? 'Шаблон в очереди' : 'Обучаемся на шаблоне'}
      </p>
      <p className={classes.analyzingText}>
        Разбираем слайды, роли полей и их вместимость, палитру и шрифты, формулируем тон бренда.
        Обычно это занимает несколько секунд.
      </p>
    </section>
  );
}

function LayoutList({
  template,
  layouts,
  aspect,
}: {
  template: Template;
  layouts: Layout[];
  aspect: number;
}) {
  const src = (slide: number) =>
    template.previewCount && slide <= template.previewCount
      ? urls.templateSlide(template.id, slide, template.updatedAt)
      : null;
  return (
    <ul className={classes.layouts}>
      {layouts.map((layout) => (
        <li key={layout.id} className={classes.layout}>
          <div className={classes.thumb}>
            <SlideImage
              src={src(layout.sourceSlide)}
              aspect={aspect}
              alt={`Слайд ${layout.sourceSlide} шаблона: ${KIND_LABELS[layout.kind]}`}
            />
          </div>
          <div className={classes.layoutInfo}>
            <p className={classes.layoutTitle}>
              {KIND_LABELS[layout.kind]}
              {layout.items > 1 && <span className={classes.layoutItems}>{layout.items} шт.</span>}
              {layout.hasImage && (
                <span
                  className={classes.layoutImage}
                  title="Картинка из слайда переезжает в презентацию как есть"
                >
                  <ImageIcon size={14} strokeWidth={1.75} aria-hidden /> картинка
                </span>
              )}
            </p>
            <p className={classes.layoutSource}>Слайд {layout.sourceSlide} шаблона</p>
            <dl className={classes.slots}>
              {groupSlots(layout).map((group) => (
                <div key={group.key} className={classes.slotRow}>
                  <dt>{slotGroupLabel(group.key)}</dt>
                  <dd>
                    {group.slots.map((slot) => (
                      <span key={slot.key}>
                        {slot.key !== group.key
                          ? 'заголовок '
                          : group.slots.length > 1
                            ? 'текст '
                            : ''}
                        <span className={classes.slotSize}>
                          {slot.charsPerLine}×{slot.maxLines}
                        </span>
                        {slot.bullets && ' · список'}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Поля карточки или колонки показываем вместе: заголовок и текст одной строкой. */
function groupSlots(layout: Layout) {
  const groups = new Map<string, Layout['slots']>();
  for (const slot of layout.slots) {
    const key = slotGroup(slot.key);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return [...groups].map(([key, slots]) => ({
    key,
    slots: [...slots].sort(
      (a, b) => Number(b.key.endsWith('_title')) - Number(a.key.endsWith('_title')),
    ),
  }));
}

/** LLM обычно нумерует правила тона «1) … 2) …» — показываем их списком, иначе абзацем. */
function Tone({ text }: { text: string }) {
  const rules = text
    .split(/(?:^|\s)\d+[).]\s+/)
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (rules.length < 2) return <p className={classes.tone}>{text}</p>;
  return (
    <ol className={classes.toneRules}>
      {rules.map((rule) => (
        <li key={rule}>{rule}</li>
      ))}
    </ol>
  );
}
