import { Tooltip } from '@mantine/core';
import classes from './Swatches.module.css';

/** Палитра бренда: маленькие образцы в таблице, крупные с hex на странице шаблона. */
export function Swatches({ colors, size = 'md' }: { colors: string[]; size?: 'sm' | 'md' }) {
  if (size === 'sm') {
    return (
      <span className={classes.row} aria-label={`Палитра: ${colors.join(', ')}`}>
        {colors.map((c) => (
          <Tooltip key={c} label={c}>
            <span className={classes.chip} style={{ background: c }} />
          </Tooltip>
        ))}
      </span>
    );
  }
  return (
    <ul className={classes.grid}>
      {colors.map((c) => (
        <li key={c} className={classes.item}>
          <span className={classes.big} style={{ background: c }} aria-hidden />
          <code className={classes.hex}>{c}</code>
        </li>
      ))}
    </ul>
  );
}
