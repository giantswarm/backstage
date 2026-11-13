import { Text } from '@backstage/ui';
import {
  CellSkeleton,
  useFactTextVariant,
} from '@giantswarm/backstage-plugin-ui-react';
import type {
  MusterSession,
  MusterSessionFailureKind,
} from '../../MusterInstanceProvider';
import { callsLine } from '../connectorFacts';
import type { ConnectorUsage } from '../hooks/useConnectorUsage';

/** Why there is no session to read the calls through, per failure. */
const NO_SESSION: Record<MusterSessionFailureKind, string> = {
  unreachable: 'Muster is not reachable from this portal',
  'session-expired': 'Your sign-in has expired',
  'mint-failed': 'No Muster session could be started',
  'muster-rejected': 'Muster refused the session',
};

export type CallsFactValueProps = {
  /** The connector's usage read (`useConnectorUsage`). */
  usage: ConnectorUsage;
  /** The muster session the read goes through. */
  session: Pick<
    MusterSession,
    'authenticated' | 'pending' | 'connecting' | 'failure'
  >;
};

/**
 * The value of the Details tab's "Calls" fact. The line itself is there from
 * the first paint, whatever the read ends in, so the facts below it never
 * move: a skeleton one line of the list's text high while the session or the
 * read is pending, then the figure, or why there is none in muted text.
 */
export function CallsFactValue({ usage, session }: CallsFactValueProps) {
  const variant = useFactTextVariant();
  const muted = (text: string) => (
    <Text variant={variant} color="secondary">
      {text}
    </Text>
  );

  // A figure already read stays through a later read's failure.
  if (usage.usage) {
    return usage.usage.available ? (
      <Text variant={variant}>{callsLine(usage.usage)}</Text>
    ) : (
      muted('Not available for this environment')
    );
  }
  if (usage.error) {
    return muted('Could not be read');
  }
  // The read, or the session it waits for, is under way; a reconnect too, so
  // the line does not say "no session" on its way to the figure.
  if (usage.isLoading || session.pending || session.connecting) {
    return (
      <CellSkeleton width={140} variant={variant} label="Reading calls…" />
    );
  }
  if (session.failure) {
    return muted(NO_SESSION[session.failure.kind]);
  }
  if (!session.authenticated) {
    return muted('Needs a Muster session');
  }
  // A session and no read: never an endless skeleton.
  return muted('Not available');
}
