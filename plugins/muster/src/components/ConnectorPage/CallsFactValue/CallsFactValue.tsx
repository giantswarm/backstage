import { Skeleton, Text, VisuallyHidden } from '@backstage/ui';
import { useFactTextVariant } from '@giantswarm/backstage-plugin-ui-react';
import { callsLine } from '../connectorFacts';
import type { ConnectorUsage } from '../hooks/useConnectorUsage';

export type CallsFactValueProps = {
  /** The connector's usage read (`useConnectorUsage`). */
  usage: ConnectorUsage;
  /** Whether there is a muster session, which the read goes through. */
  authenticated: boolean;
  /** Whether the muster session is still being established. */
  sessionPending: boolean;
};

/**
 * The value of the Details tab's "Calls" fact. The line itself is there from
 * the first paint, whatever the read ends in, so the facts below it never
 * move: a skeleton one line of the list's text high while the session or the
 * read is pending, then the figure, or why there is none in muted text.
 */
export function CallsFactValue({
  usage: { usage, error },
  authenticated,
  sessionPending,
}: CallsFactValueProps) {
  const variant = useFactTextVariant();
  const muted = (text: string) => (
    <Text variant={variant} color="secondary">
      {text}
    </Text>
  );

  if (usage) {
    return usage.available ? (
      <Text variant={variant}>{callsLine(usage)}</Text>
    ) : (
      muted('Not available for this environment')
    );
  }
  if (error) {
    return muted('Could not be read');
  }
  // Pending until the read has an answer: a read about to start (enabled a
  // render later) counts, so the skeleton never gives way to nothing.
  if (sessionPending || authenticated) {
    return (
      // Inside a `Text` of the list's variant, `1lh` is the line the figure
      // will take, so the row keeps its height when it lands.
      <Text variant={variant}>
        <Skeleton
          data-testid="calls-skeleton"
          width={140}
          height="1lh"
          style={{
            display: 'inline-block',
            verticalAlign: 'top',
            maxWidth: '100%',
          }}
          rounded
        />
        <VisuallyHidden>Reading calls…</VisuallyHidden>
      </Text>
    );
  }
  return muted('Needs a muster session');
}
