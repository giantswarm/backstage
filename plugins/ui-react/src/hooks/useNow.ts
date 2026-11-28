import { useEffect, useState } from 'react';

/** Current time for elapsed text; disabled consumers schedule no refresh. */
export function useNow(intervalMs = 10_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const refresh = () => setNow(Date.now());
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
  return now;
}
