import type { ReactNode } from 'react';
import classes from './Page.module.css';

/** Рабочая область экрана: одинаковые поля и максимальная ширина во всём продукте. */
export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={classes.page} data-wide={wide || undefined}>
      {children}
    </div>
  );
}

/** Смысловой блок страницы: короткий заголовок, при необходимости действие справа. */
export function Section({
  title,
  description,
  aside,
  children,
}: {
  title?: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={classes.section}>
      {(title || aside) && (
        <div className={classes.sectionHead}>
          <div>
            {title && <h2 className={classes.sectionTitle}>{title}</h2>}
            {description && <p className={classes.sectionDescription}>{description}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
