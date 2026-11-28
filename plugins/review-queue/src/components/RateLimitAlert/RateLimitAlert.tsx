import { useEffect, useState } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';

/**
 * Whether `time` is still ahead. The answer flips once, when the time
 * passes, so a control held until then comes back by itself.
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

function clockTime(time: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(
    time,
  );
}

/**
 * GitHub refuses the person's token for rate. The lists the tab already
 * read stay; the alert says when GitHub serves the token again rather than
 * inviting a Refresh that is refused the same way.
 */
export function RateLimitAlert({
  resetAt,
  message,
}: {
  resetAt: Date | undefined;
  /** GitHub's refusal in its own words, shown under the alert's. */
  message: string;
}) {
  const isRefused = useIsBefore(resetAt);
  if (resetAt && !isRefused) {
    return (
      <Alert
        status="info"
        icon
        title="GitHub serves your token again"
        description="The rate limit has reset. Refresh reads the lists again."
      />
    );
  }
  const until = resetAt ? ` until ${clockTime(resetAt)}` : '';
  return (
    <Alert
      status="warning"
      icon
      title={`GitHub's rate limit is reached${until}`}
      description={
        <Flex direction="column" gap="1">
          <Text variant="body-small">
            {`GitHub limits the searches and requests of your token, across every GitHub tool you use through muster. The lists below are from the last answer. ${
              resetAt
                ? 'Refresh comes back then.'
                : 'Wait a minute before you refresh.'
            }`}
          </Text>
          <Text variant="body-small" color="secondary">
            {message}
          </Text>
        </Flex>
      }
    />
  );
}
