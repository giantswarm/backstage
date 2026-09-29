import { Button, Flex, Link, Text } from '@backstage/ui';
import { FactList, type Fact } from '@giantswarm/backstage-plugin-ui-react';

import { versionOf, type BotPrRow } from '../../lib/marge';

const date = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

export type BotPrDetailsProps = {
  row: BotPrRow;
  /** Whether the person's session reaches marge, so the actions are offered. */
  canAct: boolean;
  onSweep: (row: BotPrRow) => void;
  onMarkBlocked: (row: BotPrRow) => void;
};

/**
 * The expanded row: everything the engine reported for the PR -- the state
 * and its evidence, the label it carries, the bot and the update, the policy
 * it was decided under and the prior rescue marker -- and the two actions the
 * page offers on one PR. The stored read carries the label and what the
 * title says; the update type, the policy and the rescue marker each need
 * the PR itself, and the record says so instead of showing a blank as a fact.
 */
export function BotPrDetails({
  row,
  canAct,
  onSweep,
  onMarkBlocked,
}: BotPrDetailsProps) {
  const policy = row.policy;
  const rescue = row.rescue;
  let rescueState: string | undefined;
  if (rescue) {
    rescueState = 'still stands';
    if (rescue.stale) {
      rescueState = 'stale: the PR changed since';
    } else if (rescue.rebased) {
      rescueState = 'still stands, rebased since';
    }
  }

  const facts: Fact[] = [
    { label: 'Classification', value: row.status },
    { label: 'Evidence', value: row.detail },
    { label: 'Label', value: row.label ?? 'none' },
    { label: 'Bot', value: row.kind },
    { label: 'Update', value: row.update_type ?? 'stored read: not read' },
    { label: 'Dependency', value: row.dependency },
    { label: 'Version', value: versionOf(row) },
    { label: 'Opened', value: date(row.created_at) },
    { label: 'Obsolete because', value: row.reason },
  ];
  if (policy) {
    facts.push(
      {
        label: 'Policy',
        value: policy.sweep ? 'sweep on' : 'sweep off for this repository',
      },
      {
        label: 'Merges when green',
        value:
          row.kind && policy.update_types[row.kind]
            ? policy.update_types[row.kind].join(', ')
            : 'nothing for this bot',
      },
      { label: 'Confirm', value: policy.rescue.confirm ?? 'per-pr' },
      { label: 'Policy files', value: policy.sources?.join(', ') },
    );
  }
  if (rescue) {
    facts.push(
      { label: 'Rescue outcome', value: rescue.outcome },
      { label: 'Rescue by', value: rescue.tool },
      { label: 'Rescue on', value: date(rescue.at) },
      { label: 'Rescue marker', value: rescueState },
      { label: 'Rescue reason', value: rescue.reason },
    );
  }

  return (
    <Flex direction="column" gap="3">
      <Text variant="body-medium">
        <Link href={row.url} target="_blank" rel="noopener noreferrer">
          {row.ref}
        </Link>{' '}
        {row.title}
      </Text>
      <FactList
        facts={facts.filter(
          fact => fact.value !== undefined && fact.value !== '',
        )}
      />
      {!policy ? (
        <Text variant="body-small" color="secondary">
          The stored read carries the label and the title. Classify now reads
          the update type, the policy and the rescue marker.
        </Text>
      ) : null}
      {canAct ? (
        <Flex gap="2">
          <Button variant="secondary" size="small" onPress={() => onSweep(row)}>
            Sweep this PR…
          </Button>
          <Button
            variant="tertiary"
            size="small"
            onPress={() => onMarkBlocked(row)}
          >
            Mark blocked…
          </Button>
        </Flex>
      ) : null}
    </Flex>
  );
}
