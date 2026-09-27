import { Loader, Skeleton } from '@mantine/core';
import { Dropzone, type FileRejection } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { MAX_TEMPLATE_SIZE_BYTES, type Template } from '@pm/shared';
import { useHead } from '@unhead/react';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTemplates, useUploadTemplate } from '../api/queries';
import table from '../components/DataTable.module.css';
import { describeError, ErrorState } from '../components/ErrorState';
import { Page, Section } from '../components/Page';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Swatches } from '../components/Swatches';
import { ago } from '../lib/format';
import classes from './TemplatesPage.module.css';

const ACCEPT = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.openxmlformats-officedocument.presentationml.template': ['.potx'],
};

export function TemplatesPage() {
  useHead({ title: 'Шаблоны' });
  const templates = useTemplates();
  const upload = useUploadTemplate();
  const [uploading, setUploading] = useState<string>();

  async function onDrop(files: File[]) {
    for (const file of files) {
      setUploading(file.name);
      try {
        await upload.mutateAsync(file);
      } catch (error) {
        notifications.show({
          title: `Не удалось загрузить ${file.name}`,
          message: describeError(error),
          color: 'red',
        });
      }
    }
    setUploading(undefined);
  }

  function onReject(rejections: FileRejection[]) {
    for (const { file, errors } of rejections) {
      const tooLarge = errors.some((e) => e.code === 'file-too-large');
      notifications.show({
        title: `${file.name} не подходит`,
        message: tooLarge ? 'Файл больше 50 МБ.' : 'Нужен .pptx или .potx.',
        color: 'red',
      });
    }
  }

  const list = templates.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Шаблоны"
        description="Загрузите .pptx с примерами слайдов бренда. Анализ идёт один раз: макеты, палитра, шрифты и тон. Дальше шаблон доступен для генерации."
      />

      <Dropzone
        onDrop={onDrop}
        onReject={onReject}
        accept={ACCEPT}
        maxSize={MAX_TEMPLATE_SIZE_BYTES}
        loading={false}
        disabled={Boolean(uploading)}
        className={classes.drop}
      >
        <div className={classes.dropInner}>
          <span className={classes.dropIcon} aria-hidden>
            {uploading ? (
              <Loader size={20} color="brand.9" />
            ) : (
              <Upload size={22} strokeWidth={1.75} />
            )}
          </span>
          <span>
            <span className={classes.dropTitle}>
              {uploading ? `Загружаем ${uploading}` : 'Перетащите шаблон или выберите файл'}
            </span>
            <span className={classes.dropHint}>
              .pptx или .potx до 50 МБ. Лучше всего работают шаблоны со слайдами-примерами: титул,
              тезисы, колонки, карточки.
            </span>
          </span>
        </div>
      </Dropzone>

      <Section title="Загруженные">
        {templates.isPending ? (
          <Skeleton height={200} radius="lg" />
        ) : templates.isError ? (
          <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
        ) : list.length === 0 ? (
          <p className={table.muted}>
            Пока ни одного шаблона. Загрузите первый — анализ займёт несколько секунд.
          </p>
        ) : (
          <TemplatesTable rows={list} />
        )}
      </Section>
    </Page>
  );
}

function TemplatesTable({ rows }: { rows: Template[] }) {
  const navigate = useNavigate();
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th>Шаблон</th>
            <th>Статус</th>
            <th className={`${table.numeric} ${table.hideSm}`}>Макеты</th>
            <th className={table.hideSm}>Палитра</th>
            <th className={table.hideSm}>Шрифты</th>
            <th className={table.hideSm}>Загружен</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const href = `/templates/${t.id}`;
            return (
              <tr
                key={t.id}
                data-href={href}
                onClick={(e) => !(e.target as Element).closest('a') && navigate(href)}
              >
                <td className={table.primaryCell}>
                  <Link to={href} className={table.primaryLink}>
                    {t.name}
                  </Link>
                  <span className={table.secondary}>{t.fileName}</span>
                </td>
                <td>
                  <StatusBadge kind="template" status={t.status} />
                </td>
                <td className={`${table.numeric} ${table.hideSm}`}>
                  {t.profile?.layouts.length ?? '—'}
                </td>
                <td className={table.hideSm}>
                  {t.profile ? <Swatches colors={t.profile.colors.slice(0, 6)} size="sm" /> : '—'}
                </td>
                <td className={`${table.muted} ${table.hideSm}`}>
                  {t.profile ? uniqueFonts(t.profile.fonts).join(', ') : '—'}
                </td>
                <td className={`${table.muted} ${table.hideSm}`}>{ago(t.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function uniqueFonts(fonts: { heading: string; body: string }): string[] {
  return [...new Set([fonts.heading, fonts.body])];
}
