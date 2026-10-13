import { useEffect, useState } from 'react';
import { Alert } from '@backstage/ui';

/**
 * Whether `time` is still ahead. The answer flips once, when the time
 * passes, so a control held until then comes back on its own.
 */
export function useIsBefore(time: Date | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  const until = time?.getTime();
  useEffect(() => {
    if (until === undefined || until <= Date.now()) {
      return undefined;
    }
    const timer = setTimeout(() => setNow(Date.now()), until - Date.now());
    return () => clearTimeout(timer);
  }, [until]);
  return until !== undefined && until > now;
}

export type RateLimitAlertProps = {
  /** When GitHub serves the token again; undefined when marge named no time. */
  resetAt: Date | undefined;
  /** The PRs a run stopped before deciding, when a run stopped partway. */
  notReached?: number;
};

function clockTime(time: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(
    time,
  );
}

/**
 * GitHub refuses the person's token for rate. marge reads and sweeps with
 * that token, and so does every other GitHub tool the person reaches through
 * muster, so the alert says when the token is served again rather than
 * inviting a retry that is refused the same way.
 */
export function RateLimitAlert({ resetAt, notReached }: RateLimitAlertProps) {
  const isRefused = useIsBefore(resetAt);
  if (resetAt && !isRefused) {
    return (
      <Alert
        status="info"
        icon
        title="GitHub serves your token again"
        description="The rate limit has reset. Refresh reads the queue again."
      />
    );
  }
  const until = resetAt ? ` until ${clockTime(resetAt)}` : '';
  const stopped =
    notReached && notReached > 0
      ? `The run stopped there and left ${notReached} PR${
          notReached === 1 ? '' : 's'
        } undecided; they keep the class they had. `
      : '';
  return (
    <Alert
      status="warning"
      icon
      title={`Your GitHub API budget is spent${until}`}
      description={`${stopped}marge reads and sweeps with your own GitHub token, and GitHub refuses it${until}, for marge and for every other GitHub tool you use through muster. The buttons that call marge come back then.`}
    />
  );
}
