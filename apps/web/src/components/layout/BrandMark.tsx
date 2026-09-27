import { Link } from 'react-router';
import classes from './BrandMark.module.css';

/** Собственный минимальный знак: слайд и лаймовая строка под ним. */
export function BrandMark() {
  return (
    <Link to="/" className={classes.mark} aria-label="Presentation Maker — на главную">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          rx="8"
          fill="none"
          stroke="rgb(255 255 255 / 0.18)"
        />
        <rect
          x="8"
          y="9"
          width="16"
          height="11"
          rx="2.5"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
        />
        <path d="M12 24h8" stroke="#00E564" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className={classes.name}>Presentation Maker</span>
    </Link>
  );
}
