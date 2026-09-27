import { GENERATION_TIME_BUDGET_MS, type Presentation } from '@pm/shared';
import { Link } from 'react-router';
import { clock, presentationName, progressShare, stageLabel } from '../lib/format';
import classes from './ActiveGenerations.module.css';
import { Elapsed } from './Elapsed';

/**
 * Идущие генерации: этап, полоса прогресса и время относительно бюджета.
 * Главный инструмент, когда три презентации запускаются параллельно.
 */
export function ActiveGenerations({
  items,
  compact = false,
}: {
  items: Presentation[];
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={classes.list} data-compact={compact || undefined} aria-live="polite">
      {items.map((p) => {
        const share = progressShare(p.status, p.progress);
        return (
          <li key={p.id}>
            <Link to={`/presentations/${p.id}`} className={classes.item}>
              <div className={classes.top}>
                <span className={classes.name}>{presentationName(p)}</span>
                <span className={classes.time}>
                  <Elapsed since={p.createdAt} running />{' '}
                  <span className={classes.budget}>
                    из {clock(GENERATION_TIME_BUDGET_MS / 1000)}
                  </span>
                </span>
              </div>
              <div
                className={classes.track}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share * 100)}
                aria-label={`Прогресс: ${presentationName(p)}`}
              >
                <span className={classes.bar} style={{ transform: `scaleX(${share})` }} />
              </div>
              <span className={classes.stage}>
                {p.status === 'PENDING' ? 'В очереди' : stageLabel(p.progress)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
