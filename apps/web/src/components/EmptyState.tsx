import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import classes from './EmptyState.module.css';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** Нумерованные шаги, если пустой экран учит последовательности. */
  steps?: string[];
}

/** Пустой экран объясняет следующий шаг, а не просто «ничего нет». */
export function EmptyState({ icon: Icon, title, children, action, steps }: EmptyStateProps) {
  return (
    <section className={classes.root}>
      <span className={classes.icon} aria-hidden>
        <Icon size={24} strokeWidth={1.75} />
      </span>
      <h2 className={classes.title}>{title}</h2>
      <p className={classes.text}>{children}</p>
      {steps && (
        <ol className={classes.steps}>
          {steps.map((step, i) => (
            <li key={step}>
              <span className={classes.stepNumber}>{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      )}
      {action && <div className={classes.action}>{action}</div>}
    </section>
  );
}
