import { useEffect, useState } from 'react';

/**
 * Whether `until` (epoch milliseconds) has passed; `false` without one.
 *
 * The deadline schedules its own render. The reads these deadlines are about
 * poll, but an unchanged answer is structurally shared and renders nothing, so
 * a `Date.now()` comparison made whenever a render happens to occur could
 * stay on the near side of the deadline for good.
 *
 * Which deadline expired is kept, not just that one did: a timer firing a
 * moment before `Date.now()` reaches `until` (a coarsened clock, or a wall
 * clock set back — timers run on a monotonic one) still counts, and a new
 * deadline starts out not passed, on its first render rather than one render
 * later.
 */
export function useDeadlinePassed(until: number | undefined): boolean {
  const [expired, setExpired] = useState<number>();
  useEffect(() => {
    if (until === undefined) {
      return undefined;
    }
    const timer = setTimeout(
      () => setExpired(until),
      Math.max(0, until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [until]);
  return until !== undefined && (expired === until || Date.now() >= until);
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
