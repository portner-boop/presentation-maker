import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import classes from './PageHeader.module.css';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Путь назад для вложенных экранов: [{ label: 'Шаблоны', to: '/templates' }]. */
  trail?: Array<{ label: string; to: string }>;
  actions?: ReactNode;
  meta?: ReactNode;
}

export function PageHeader({ title, description, trail, actions, meta }: PageHeaderProps) {
  return (
    <header className={classes.header}>
      {trail && (
        <nav aria-label="Навигация по разделу" className={classes.trail}>
          {trail.map((item) => (
            <span key={item.to} className={classes.crumb}>
              <Link to={item.to}>{item.label}</Link>
              <ChevronRight size={14} strokeWidth={2} aria-hidden />
            </span>
          ))}
        </nav>
      )}
      <div className={classes.row}>
        <div className={classes.text}>
          <h1 className={classes.title}>{title}</h1>
          {description && <p className={classes.description}>{description}</p>}
          {meta && <div className={classes.meta}>{meta}</div>}
        </div>
        {actions && <div className={classes.actions}>{actions}</div>}
      </div>
    </header>
  );
}
