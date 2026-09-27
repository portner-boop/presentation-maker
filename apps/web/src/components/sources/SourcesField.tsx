import { ActionIcon, Button, Loader, TextInput, Tooltip } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { MAX_COLLECTED_CHARS } from '@pm/shared';
import { FileArchive, FileText, FolderOpen, GitBranch, X } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import {
  bundleChars,
  bundleFromFiles,
  bundleFromFolder,
  bundleFromZip,
  type SourceBundle,
} from '../../lib/browser-sources';
import { compactNumber, filesLabel } from '../../lib/format';
import classes from './SourcesField.module.css';

interface SourcesFieldProps {
  bundles: SourceBundle[];
  onChange: (bundles: SourceBundle[]) => void;
  gitUrl: ReactNode;
}

const KIND_ICON = { folder: FolderOpen, zip: FileArchive, files: FileText } as const;

/**
 * Материалы к задаче. Папка и файлы читаются прямо в браузере (только текст, без зависимостей
 * и сборок), git-репозиторий клонирует сервер.
 */
export function SourcesField({ bundles, onChange, gitUrl }: SourcesFieldProps) {
  const folderInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();

  const totalChars = bundles.reduce((sum, b) => sum + bundleChars(b), 0);
  const totalFiles = bundles.reduce((sum, b) => sum + b.files.length, 0);
  const share = Math.min(1, totalChars / MAX_COLLECTED_CHARS);

  async function add(read: () => Promise<SourceBundle>) {
    setReading(true);
    setError(undefined);
    try {
      const bundle = await read();
      if (bundle.files.length === 0) {
        setError(`В «${bundle.name}» нет текстовых файлов: код, документация, markdown.`);
        return;
      }
      onChange([...bundles, bundle]);
    } catch {
      setError('Не удалось прочитать файлы. Если это архив — проверьте, что он не повреждён.');
    } finally {
      setReading(false);
    }
  }

  function onDrop(files: File[]) {
    const zips = files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
    const rest = files.filter((f) => !zips.includes(f));
    for (const zip of zips) void add(() => bundleFromZip(zip));
    if (rest.length > 0) void add(() => bundleFromFiles(rest));
  }

  return (
    <div className={classes.root}>
      <Dropzone
        onDrop={onDrop}
        activateOnClick={false}
        multiple
        className={classes.drop}
        aria-label="Перетащите сюда .zip или файлы"
      >
        <div className={classes.dropInner}>
          <p className={classes.dropText}>
            Перетащите .zip или файлы сюда
            <span>
              README, документация, код — всё текстовое. Зависимости и сборки пропускаются.
            </span>
          </p>
          <div className={classes.buttons}>
            <Button
              variant="default"
              size="sm"
              leftSection={<FolderOpen size={16} strokeWidth={1.75} />}
              onClick={() => folderInput.current?.click()}
              disabled={reading}
            >
              Папка
            </Button>
            <FilePickerButton
              accept=".zip,application/zip"
              icon={<FileArchive size={16} strokeWidth={1.75} />}
              label="Архив .zip"
              disabled={reading}
              onPick={(files) => files[0] && add(() => bundleFromZip(files[0]))}
            />
            <FilePickerButton
              multiple
              icon={<FileText size={16} strokeWidth={1.75} />}
              label="Файлы"
              disabled={reading}
              onPick={(files) => files.length && add(() => bundleFromFiles(files))}
            />
            {reading && <Loader size="sm" color="brand.9" aria-label="Читаем файлы" />}
          </div>
        </div>
      </Dropzone>
      <input
        ref={folderInput}
        type="file"
        hidden
        // @ts-expect-error: нестандартные атрибуты выбора папки
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          const list = e.currentTarget.files;
          if (list?.length) void add(() => bundleFromFolder(list));
          e.currentTarget.value = '';
        }}
      />

      {error && (
        <p className={classes.error} role="alert">
          {error}
        </p>
      )}

      {bundles.length > 0 && (
        <div className={classes.bundles}>
          <ul className={classes.list}>
            {bundles.map((bundle) => {
              const Icon = KIND_ICON[bundle.kind];
              return (
                <li key={bundle.id} className={classes.bundle}>
                  <Icon size={18} strokeWidth={1.75} className={classes.bundleIcon} aria-hidden />
                  <span className={classes.bundleName}>{bundle.name}</span>
                  <span className={classes.bundleMeta}>
                    {filesLabel(bundle.files.length)} · {compactNumber(bundleChars(bundle))}{' '}
                    символов
                    {bundle.skipped > 0 && ` · пропущено ${bundle.skipped}`}
                  </span>
                  <Tooltip label="Убрать">
                    <ActionIcon
                      size="md"
                      aria-label={`Убрать ${bundle.name}`}
                      onClick={() => onChange(bundles.filter((b) => b.id !== bundle.id))}
                    >
                      <X size={16} strokeWidth={1.75} />
                    </ActionIcon>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
          <div className={classes.total}>
            <span>
              Всего {filesLabel(totalFiles)}, {compactNumber(totalChars)} из{' '}
              {compactNumber(MAX_COLLECTED_CHARS)} символов
            </span>
            <span className={classes.meter} aria-hidden>
              <span style={{ transform: `scaleX(${share})` }} data-full={share >= 1 || undefined} />
            </span>
          </div>
          {share >= 1 && (
            <p className={classes.hint}>
              Лимит превышен: в генерацию попадут README и документация, часть кода отрежется.
            </p>
          )}
        </div>
      )}

      <div className={classes.git}>{gitUrl}</div>
    </div>
  );
}

function FilePickerButton({
  accept,
  multiple,
  icon,
  label,
  disabled,
  onPick,
}: {
  accept?: string;
  multiple?: boolean;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onPick: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        variant="default"
        size="sm"
        leftSection={icon}
        onClick={() => input.current?.click()}
        disabled={disabled}
      >
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          onPick(Array.from(e.currentTarget.files ?? []));
          e.currentTarget.value = '';
        }}
      />
    </>
  );
}

export function GitUrlInput(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      label="Git-репозиторий"
      description="Публичная https-ссылка. Сервер склонирует последний коммит."
      placeholder="https://github.com/team/project"
      leftSection={<GitBranch size={16} strokeWidth={1.75} />}
      inputMode="url"
      autoComplete="off"
      spellCheck={false}
      {...props}
    />
  );
}
