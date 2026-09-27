import { zodResolver } from '@hookform/resolvers/zod';
import { Button, SegmentedControl, Select, Skeleton, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { GIT_URL_PATTERN, type Template } from '@pm/shared';
import { useHead } from '@unhead/react';
import { ArrowRight, LayoutTemplate, Sparkles } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import {
  isPresentationActive,
  useCreatePresentation,
  usePresentations,
  useTemplates,
} from '../api/queries';
import { ActiveGenerations } from '../components/ActiveGenerations';
import { EmptyState } from '../components/EmptyState';
import { describeError, ErrorState } from '../components/ErrorState';
import { Page } from '../components/Page';
import { PageHeader } from '../components/PageHeader';
import { GitUrlInput, SourcesField } from '../components/sources/SourcesField';
import type { SourceBundle } from '../lib/browser-sources';
import { ago, layoutsLabel } from '../lib/format';
import { usePreferences } from '../stores/preferences';
import classes from './NewPresentationPage.module.css';

const DURATIONS = [3, 5, 7, 10, 15];

const FormSchema = z.object({
  templateId: z.string().min(1, 'Выберите шаблон'),
  brief: z
    .string()
    .trim()
    .min(10, 'Опишите задачу хотя бы одной фразой: о чём и для кого выступление')
    .max(20_000, 'Слишком длинно: до 20 000 символов, подробности лучше приложить материалами'),
  durationMinutes: z.number().int().min(1).max(120),
  gitUrl: z.union([
    z.literal(''),
    z.string().trim().regex(GIT_URL_PATTERN, 'Нужна https-ссылка на публичный репозиторий'),
  ]),
});
type FormValues = z.infer<typeof FormSchema>;

export function NewPresentationPage() {
  useHead({ title: 'Новая презентация' });
  const navigate = useNavigate();
  const templates = useTemplates();
  const presentations = usePresentations();
  const create = useCreatePresentation();
  const { lastTemplateId, lastDuration, remember } = usePreferences();
  const [templateParam] = useQueryState('template', parseAsString);
  const [bundles, setBundles] = useState<SourceBundle[]>([]);
  const [pending, setPending] = useState<'open' | 'another' | null>(null);

  const ready = useMemo(
    () => templates.data?.filter((t) => t.status === 'READY') ?? [],
    [templates.data],
  );
  const defaultTemplate =
    ready.find((t) => t.id === templateParam) ??
    ready.find((t) => t.id === lastTemplateId) ??
    ready[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: 'onTouched',
    defaultValues: { templateId: '', brief: '', durationMinutes: lastDuration, gitUrl: '' },
  });

  // шаблоны приходят асинхронно: подставляем умное значение, пока пользователь не выбрал сам
  useEffect(() => {
    if (defaultTemplate && !form.getValues('templateId'))
      form.setValue('templateId', defaultTemplate.id);
  }, [defaultTemplate, form]);

  const active = presentations.data?.filter(isPresentationActive) ?? [];

  async function submit(values: FormValues, andAnother: boolean) {
    setPending(andAnother ? 'another' : 'open');
    try {
      const presentation = await create.mutateAsync({
        templateId: values.templateId,
        brief: values.brief,
        durationMinutes: values.durationMinutes,
        gitUrl: values.gitUrl || undefined,
        sources: bundles.length ? bundles.flatMap((b) => b.files) : undefined,
      });
      remember({ templateId: values.templateId, duration: values.durationMinutes });
      if (andAnother) {
        notifications.show({
          title: 'Генерация запущена',
          message: 'Форма сохранена: поменяйте задачу и запустите следующую.',
          color: 'lime',
        });
      } else {
        navigate(`/presentations/${presentation.id}`);
      }
    } catch (error) {
      notifications.show({
        title: 'Не удалось запустить генерацию',
        message: describeError(error),
        color: 'red',
      });
    } finally {
      setPending(null);
    }
  }

  if (templates.isPending) {
    return (
      <Page>
        <PageHeader title="Новая презентация" />
        <Skeleton height={320} radius="lg" maw={720} />
      </Page>
    );
  }

  if (templates.isError) {
    return (
      <Page>
        <PageHeader title="Новая презентация" />
        <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
      </Page>
    );
  }

  if (ready.length === 0) {
    const processing = templates.data?.some(
      (t) => t.status === 'PENDING' || t.status === 'PROCESSING',
    );
    return (
      <Page>
        <PageHeader title="Новая презентация" />
        <EmptyState
          icon={LayoutTemplate}
          title={processing ? 'Шаблон ещё обучается' : 'Нужен готовый шаблон'}
          action={
            <Button
              component={Link}
              to="/templates"
              leftSection={<LayoutTemplate size={18} strokeWidth={1.75} />}
            >
              {processing ? 'Открыть шаблоны' : 'Загрузить шаблон'}
            </Button>
          }
        >
          {processing
            ? 'Анализ занимает несколько секунд. Как только шаблон будет готов, здесь появится форма.'
            : 'Презентация собирается из слайдов брендового шаблона. Загрузите .pptx с примерами слайдов.'}
        </EmptyState>
      </Page>
    );
  }

  const { errors } = form.formState;
  const briefLength = form.watch('brief').length;

  return (
    <Page wide>
      <PageHeader
        trail={[{ label: 'Презентации', to: '/' }]}
        title="Новая презентация"
        description="Слайды соберутся из макетов шаблона, к каждому будет текст спикера под выбранный тайминг."
      />

      <div className={classes.layout}>
        <form
          className={classes.form}
          noValidate
          onSubmit={form.handleSubmit((values) => submit(values, false))}
        >
          <fieldset className={classes.group}>
            <legend className={classes.legend}>Что говорим</legend>
            <Controller
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <Select
                  label="Шаблон"
                  data={ready.map((t) => ({ value: t.id, label: t.name }))}
                  renderOption={({ option }) => (
                    <TemplateOption template={ready.find((t) => t.id === option.value)!} />
                  )}
                  value={field.value || null}
                  onChange={(value) => field.onChange(value ?? '')}
                  onBlur={field.onBlur}
                  error={errors.templateId?.message}
                  searchable={ready.length > 6}
                  nothingFoundMessage="Нет такого шаблона"
                  comboboxProps={{ shadow: 'md' }}
                />
              )}
            />

            <Textarea
              label="Задача"
              description="О чём выступление, для кого, какие тезисы обязательны."
              placeholder="Финал хакатона, аудитория — жюри. Проблема, наше решение, как устроено, демо и планы."
              autosize
              minRows={5}
              maxRows={14}
              error={errors.brief?.message}
              {...form.register('brief')}
            />
            <p className={classes.counter} aria-live="off">
              {briefLength.toLocaleString('ru')} / 20 000
            </p>

            <Controller
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <div className={classes.field}>
                  <span className={classes.label} id="duration-label">
                    Длительность выступления
                  </span>
                  <span className={classes.fieldHint}>
                    От неё зависит число слайдов и объём текста спикера.
                  </span>
                  <SegmentedControl
                    aria-labelledby="duration-label"
                    value={String(field.value)}
                    onChange={(value) => field.onChange(Number(value))}
                    data={DURATIONS.map((m) => ({ value: String(m), label: `${m} мин` }))}
                    className={classes.segmented}
                  />
                </div>
              )}
            />
          </fieldset>

          <fieldset className={classes.group}>
            <legend className={classes.legend}>
              Материалы <span className={classes.optional}>необязательно</span>
            </legend>
            <p className={classes.groupHint}>
              Факты для слайдов берутся отсюда: без материалов презентация соберётся только по
              задаче.
            </p>
            <SourcesField
              bundles={bundles}
              onChange={setBundles}
              gitUrl={<GitUrlInput error={errors.gitUrl?.message} {...form.register('gitUrl')} />}
            />
          </fieldset>

          <div className={classes.submit}>
            <Button
              type="submit"
              size="md"
              loading={pending === 'open'}
              rightSection={<ArrowRight size={18} strokeWidth={2} />}
              disabled={pending === 'another'}
            >
              Сгенерировать
            </Button>
            <Button
              type="button"
              variant="default"
              leftSection={<Sparkles size={16} strokeWidth={1.75} />}
              loading={pending === 'another'}
              disabled={pending === 'open'}
              onClick={form.handleSubmit((values) => submit(values, true))}
            >
              Сгенерировать и начать ещё одну
            </Button>
          </div>
        </form>

        <aside className={classes.aside} aria-label="Идущие генерации">
          <h2 className={classes.asideTitle}>Идут сейчас</h2>
          {active.length > 0 ? (
            <ActiveGenerations items={active} compact />
          ) : (
            <p className={classes.asideEmpty}>
              Здесь появятся запущенные генерации. Можно запустить до трёх подряд — они идут
              параллельно.
            </p>
          )}
        </aside>
      </div>
    </Page>
  );
}

function TemplateOption({ template }: { template: Template }) {
  return (
    <span className={classes.option}>
      <span className={classes.optionName}>{template.name}</span>
      <span className={classes.optionMeta}>
        {template.profile ? layoutsLabel(template.profile.layouts.length) : ''} ·{' '}
        {ago(template.createdAt)}
      </span>
    </span>
  );
}
