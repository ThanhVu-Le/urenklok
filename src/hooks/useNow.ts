import { useEffect, useState } from 'react';

/**
 * Huidige tijd, elke `intervalMs` ververst. Wordt direct bijgewerkt als de app weer zichtbaar wordt
 * (na slaapstand of een andere tab), zodat de timer nooit achterloopt.
 */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs, enabled]);

  return now;
}
