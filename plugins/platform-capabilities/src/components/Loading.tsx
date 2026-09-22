import { useEffect, useState } from 'react';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';

/** The seconds a wait lasts before the label starts counting them. */
const COUNT_AFTER = 10;

/** Whole seconds since the component mounted, ticking once a second while it is mounted. */
function useElapsed(): number {
  const [started] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const handle = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(handle);
  }, [started]);
  return elapsed;
}

/**
 * The indicator for a region of the tab that is still loading -- the
 * installation as the tab opens, a comparison in flight -- with the elapsed
 * time on the label once the wait passes ten seconds: a comparison reads
 * every repository and runs the probes, so a person sees the wait counted
 * rather than a card that may be stuck. Mounted for as long as the wait
 * lasts, so the timer clears when it settles.
 */
export function Loading({ label, testId }: { label: string; testId?: string }) {
  const elapsed = useElapsed();
  const text = elapsed >= COUNT_AFTER ? `${label} · ${elapsed} s` : label;
  return (
    <div data-testid={testId}>
      <LoadingIndicator label={text} />
    </div>
  );
}
