import { ActionIcon, Button, SegmentedControl, Skeleton, Tooltip } from '@mantine/core';
import type { Presentation } from '@pm/shared';
import { useHead } from '@unhead/react';
import { Download, LayoutTemplate, Plus, Presentation as PresentationIcon } from 'lucide-react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { urls } from '../api/client';
import { isPresentationActive, usePresentations, useTemplates } from '../api/queries';
import { ActiveGenerations } from '../components/ActiveGenerations';
import table from '../components/DataTable.module.css';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Page, Section } from '../components/Page';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { ago, presentationName, seconds } from '../lib/format';

const FILTERS = ['all', 'ready', 'failed'] as const;
type Filter = (typeof FILTERS)[number];

export function PresentationsPage() {
  useHead({ title: 'Презентации' });
  const presentations = usePresentations();
  const templates = useTemplates();
  const [filter, setFilter] = useQueryState(
    'status',
    parseAsStringLiteral(FILTERS).withDefault('all'),
  );

  const templateNames = useMemo(
    () => new Map(templates.data?.map((t) => [t.id, t.name]) ?? []),
    [templates.data],
  );
  const all = presentations.data ?? [];
  const active = all.filter(isPresentationActive);
  const counts = {
    all: all.length,
    ready: all.filter((p) => p.status === 'READY').length,
    failed: all.filter((p) => p.status === 'FAILED').length,
  };
  const rows = all.filter(
    (p) => filter === 'all' || p.status === (filter === 'ready' ? 'READY' : 'FAILED'),
  );
  const hasReadyTemplate = templates.data?.some((t) => t.status === 'READY') ?? false;

  return (
    <Page>
      <PageHeader
        title="Презентации"
        description="Задача и материалы на входе — .pptx в стиле бренда и текст спикера на выходе. Три генерации параллельно укладываются в 5 минут."
      />

      {presentations.isPending || templates.isPending ? (
        <TableSkeleton />
      ) : presentations.isError ? (
        <ErrorState error={presentations.error} onRetry={() => presentations.refetch()} />
      ) : all.length === 0 ? (
        hasReadyTemplate ? (
          <EmptyState
            icon={PresentationIcon}
            title="Первая презентация — одна форма"
            action={
              <Button
                component={Link}
                to="/presentations/new"
                leftSection={<Plus size={18} strokeWidth={2} />}
              >
                Новая презентация
              </Button>
            }
          >
            Опишите задачу, добавьте репозиторий или документацию и выберите длительность
            выступления. Через минуту будут слайды и текст спикера.
          </EmptyState>
        ) : (
          <EmptyState
            icon={LayoutTemplate}
            title="Начните с шаблона"
            steps={[
              'Загрузите брендовый .pptx — анализ займёт несколько секунд',
              'Опишите задачу и добавьте материалы',
              'Получите .pptx и текст выступления',
            ]}
            action={
              <Button
                component={Link}
                to="/templates"
                leftSection={<LayoutTemplate size={18} strokeWidth={1.75} />}
              >
                Загрузить шаблон
              </Button>
            }
          >
            Сервис собирает презентации из слайдов вашего шаблона, поэтому сначала нужен сам шаблон.
          </EmptyState>
        )
      ) : (
        <>
          {active.length > 0 && (
            <Section
              title="Идут сейчас"
              description="Время считается с момента запуска, бюджет — 5 минут на генерацию."
            >
              <ActiveGenerations items={active} />
            </Section>
          )}

          <Section
            title="Все презентации"
            aside={
              <SegmentedControl
                size="sm"
                value={filter}
                onChange={(value) => setFilter(value as Filter)}
                data={[
                  { value: 'all', label: `Все · ${counts.all}` },
                  { value: 'ready', label: `Готовые · ${counts.ready}` },
                  { value: 'failed', label: `С ошибкой · ${counts.failed}` },
                ]}
                aria-label="Фильтр по статусу"
              />
            }
          >
            {rows.length === 0 ? (
              <p className={table.muted}>Нет презентаций с таким статусом.</p>
            ) : (
              <PresentationsTable rows={rows} templateNames={templateNames} />
            )}
          </Section>
        </>
      )}
    </Page>
  );
}

function PresentationsTable({
  rows,
  templateNames,
}: {
  rows: Presentation[];
  templateNames: Map<string, string>;
}) {
  const navigate = useNavigate();
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th>Презентация</th>
            <th>Статус</th>
            <th className={`${table.numeric} ${table.hideSm}`}>Слайды</th>
            <th className={`${table.numeric} ${table.hideSm}`}>Выступление</th>
            <th className={`${table.numeric} ${table.hideSm}`}>Генерация</th>
            <th className={table.hideSm}>Создана</th>
            <th className={table.actions}>
              <span className="visually-hidden">Действия</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const href = `/presentations/${p.id}`;
            return (
              <tr
                key={p.id}
                data-href={href}
                onClick={(e) => !isInteractive(e.target) && navigate(href)}
              >
                <td className={table.primaryCell}>
                  <Link to={href} className={table.primaryLink}>
                    {presentationName(p)}
                  </Link>
                  <span className={table.secondary}>
                    {templateNames.get(p.templateId) ?? 'Шаблон удалён'}
                  </span>
                </td>
                <td>
                  <StatusBadge kind="presentation" status={p.status} />
                </td>
                <td className={`${table.numeric} ${table.hideSm}`}>{p.slides?.length ?? '—'}</td>
                <td className={`${table.numeric} ${table.hideSm}`}>
                  {p.durationMinutes ? `${p.durationMinutes} мин` : '—'}
                </td>
                <td className={`${table.numeric} ${table.hideSm}`}>
                  {p.stats ? seconds(p.stats.totalMs) : '—'}
                </td>
                <td className={`${table.muted} ${table.hideSm}`}>{ago(p.createdAt)}</td>
                <td className={table.actions}>
                  {p.status === 'READY' && (
                    <Tooltip label="Скачать .pptx">
                      <ActionIcon
                        component="a"
                        href={urls.presentationFile(p.id)}
                        download
                        aria-label="Скачать .pptx"
                      >
                        <Download size={18} strokeWidth={1.75} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a, button'));
}

function TableSkeleton() {
  return (
    <div className={table.wrap} aria-busy="true" aria-label="Загружаем список">
      <Skeleton height={44} radius={0} />
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 24,
            padding: '20px 16px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <Skeleton height={14} width="40%" />
          <Skeleton height={14} width={80} />
          <Skeleton height={14} width={60} />
        </div>
      ))}
    </div>
  );
}
