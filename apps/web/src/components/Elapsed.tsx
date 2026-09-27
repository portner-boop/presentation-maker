import { useEffect, useState } from 'react';
import { clock } from '../lib/format';

/** Текущее время, обновляется раз в секунду, пока компонент активен. */
export function useNow(active = true, intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** Сколько прошло с начала: «0:42». Для идущих генераций рядом с бюджетом. */
export function Elapsed({ since, running }: { since: string; running: boolean }) {
  const now = useNow(running);
  return (
    <time className="tabular" dateTime={since}>
      {clock((now - new Date(since).getTime()) / 1000)}
    </time>
  );
}
