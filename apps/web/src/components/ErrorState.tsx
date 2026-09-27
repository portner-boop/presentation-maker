import { Button } from '@mantine/core';
import { ApiError } from '@pm/shared';
import { AlertCircle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import classes from './ErrorState.module.css';

/** Ошибка с понятной причиной и действием, а не «что-то пошло не так». */
export function ErrorState({
  error,
  title = 'Не удалось загрузить данные',
  onRetry,
  children,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={classes.root} role="alert">
      <AlertCircle size={20} strokeWidth={1.75} className={classes.icon} aria-hidden />
      <div className={classes.body}>
        <p className={classes.title}>{title}</p>
        <p className={classes.text}>{describeError(error)}</p>
        {(onRetry || children) && (
          <div className={classes.actions}>
            {onRetry && (
              <Button
                variant="default"
                size="sm"
                leftSection={<RotateCw size={16} strokeWidth={1.75} />}
                onClick={onRetry}
              >
                Повторить
              </Button>
            )}
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Такой записи нет — возможно, её удалили.';
    if (error.status >= 500) return `Сервер ответил ошибкой ${error.status}. ${error.message}`;
    return error.message;
  }
  if (error instanceof TypeError) return 'Нет связи с api. Проверьте, что сервис запущен.';
  return error instanceof Error ? error.message : 'Неизвестная ошибка.';
}
