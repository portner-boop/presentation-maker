import type { Presentation, Template } from '@pm/shared';
import { PRESENTATION_STATUS, TEMPLATE_STATUS } from '../lib/format';
import classes from './StatusBadge.module.css';

type Tone = 'ready' | 'running' | 'queued' | 'error';

const TEMPLATE_TONE: Record<Template['status'], Tone> = {
  PENDING: 'queued',
  PROCESSING: 'running',
  READY: 'ready',
  FAILED: 'error',
};

const PRESENTATION_TONE: Record<Presentation['status'], Tone> = {
  PENDING: 'queued',
  GENERATING: 'running',
  READY: 'ready',
  FAILED: 'error',
};

type Props =
  | { kind: 'template'; status: Template['status']; label?: string }
  | { kind: 'presentation'; status: Presentation['status']; label?: string };

/** Статус всегда текстом и точкой: цвет не единственный носитель смысла. */
export function StatusBadge(props: Props) {
  const tone =
    props.kind === 'template' ? TEMPLATE_TONE[props.status] : PRESENTATION_TONE[props.status];
  const text =
    props.label ??
    (props.kind === 'template' ? TEMPLATE_STATUS[props.status] : PRESENTATION_STATUS[props.status]);
  return (
    <span className={classes.badge} data-tone={tone}>
      <span className={classes.dot} aria-hidden />
      {text}
    </span>
  );
}
