import { Alert, Flex, Link, Text } from '@backstage/ui';
import { egressOriginFor, EgressRefusedItem } from '../../lib/egressRefusals';

export type EgressSettingsLink = {
  /** The agent's name as the page shows it. */
  agentName?: string;
  /** The agent's edit page, where its egress origins are set; absent when unknown. */
  href?: string;
};

function destinationOf(item: EgressRefusedItem): string {
  if (!item.host) {
    return 'a host';
  }
  return item.port ? `${item.host}:${item.port}` : item.host;
}

function timeOf(at: string | undefined): string | undefined {
  if (!at) {
    return undefined;
  }
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Connections of this turn the agent's egress policy refused, to one
 * destination: which host, why, when, and where the agent's egress is set.
 * A warning, not an error: the turn went on, and what the agent made of the
 * refusal is in its answer under it.
 */
export function EgressRefusedEntry({
  item,
  egressSettings,
}: {
  item: EgressRefusedItem;
  egressSettings?: EgressSettingsLink;
}) {
  const agent = egressSettings?.agentName ?? 'this agent';
  const origin = egressOriginFor(item);
  const reason =
    item.scheme === 'tcp'
      ? 'Raw TCP connections are not available to agents'
      : `Not in ${agent}’s egress settings`;
  const facts = [
    reason,
    timeOf(item.at),
    item.count === 1 ? '1 request' : `${item.count} requests in this turn`,
  ].filter(Boolean);
  let remedy = `An editor of ${agent} can allow it in its egress settings`;
  if (origin) {
    remedy = `An editor of ${agent} can add ${origin} to its Extra egress origins`;
  } else if (item.scheme === 'tcp') {
    remedy = `${agent}’s egress settings list the HTTP and HTTPS origins it may reach`;
  }

  return (
    <div
      data-testid="timeline-egress-refused"
      data-host={item.host}
      data-port={item.port}
    >
      <Alert
        status="warning"
        icon
        title={`Egress refused: ${destinationOf(item)}`}
        description={
          <Flex direction="column" gap="1">
            <Text variant="body-small">{facts.join(' · ')}</Text>
            <Text variant="body-small">
              {remedy}
              {egressSettings?.href ? (
                <>
                  {': '}
                  <Link href={egressSettings.href}>
                    {agent}’s egress settings
                  </Link>
                </>
              ) : (
                '.'
              )}
            </Text>
          </Flex>
        }
      />
    </div>
  );
}
