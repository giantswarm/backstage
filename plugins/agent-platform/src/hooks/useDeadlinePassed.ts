import { useEffect, useState } from 'react';

/**
 * Whether `until` (epoch milliseconds on the `now` clock) has passed; `false`
 * without one.
 *
 * The deadline schedules its own render. The reads these deadlines are about
 * poll, but an unchanged answer is structurally shared and renders nothing, so
 * a comparison made whenever a render happens to occur could stay on the near
 * side of the deadline for good.
 *
 * The timer runs on the browser's monotonic clock and `now` on another (the
 * server's, see `useServerClock`, or a wall clock set back), so it can fire
 * before `now` reaches `until`. It then re-arms for what is left, rather than
 * calling the deadline passed: whoever reads `now` at that moment — to build
 * rows, say — has to agree. Which deadline expired is kept, so a new deadline
 * starts out not passed on its first render.
 */
export function useDeadlinePassed(
  until: number | undefined,
  now: () => number = Date.now,
): boolean {
  const [expired, setExpired] = useState<number>();
  useEffect(() => {
    if (until === undefined) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const remaining = until - now();
      if (remaining <= 0) {
        setExpired(until);
      } else {
        timer = setTimeout(check, remaining);
      }
    };
    check();
    return () => clearTimeout(timer);
  }, [until, now]);
  return until !== undefined && (expired === until || now() >= until);
}

/**
 * When the watch named `key` started, as epoch milliseconds; `undefined`
 * without one. A new key starts a new watch on the render that first sees it,
 * so nothing measured from it carries the previous watch's age for a render.
 */
export function useWatchStartedAt(key: string | undefined): number | undefined {
  const [watch, setWatch] = useState<{ key: string; startedAt: number }>();
  if (key === undefined) {
    return undefined;
  }
  if (watch?.key !== key) {
    // Adjusting state while rendering, as React documents for state derived
    // from props: this render is discarded and re-run with the new watch.
    const startedAt = Date.now();
    setWatch({ key, startedAt });
    return startedAt;
  }
  return watch.startedAt;
}

/**
 * Whether there is a deadline and it has not passed yet: a window that is
 * open, closing on its own at `until` (see {@link useDeadlinePassed}).
 */
export function useBeforeDeadline(
  until: number | undefined,
  now: () => number = Date.now,
): boolean {
  const isPast = useDeadlinePassed(until, now);
  return until !== undefined && !isPast;
}
