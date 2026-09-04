import { Flex, Grid, Text } from '@backstage/ui';
import { KarpenterMachinePool } from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { type KarpenterNodePoolStatus, type MixEntry } from '../../../../hooks';
import {
  ARCH_KEY,
  CAPACITY_TYPE_KEY,
  findRequirementEntry,
  formatConsolidationPolicy,
  formatGoDuration,
  formatLimits,
  INSTANCE_FAMILY_KEY,
  INSTANCE_TYPE_KEY,
  parseRequirements,
  ZONE_KEY,
} from '../karpenter';
import { EnvelopeTable, type EnvelopeRow } from './EnvelopeTable';
import { type Fact, FactList } from './FactList';
import { RunningSummary } from './RunningSummary';
import { formatResourceName } from './resourceFormat';

/** Dimensions we can compare against live data, in reading order. */
const COMPARED_KEYS = [
  { key: CAPACITY_TYPE_KEY, label: 'Capacity type' },
  { key: ARCH_KEY, label: 'Architecture' },
  { key: INSTANCE_FAMILY_KEY, label: 'Instance families' },
  { key: INSTANCE_TYPE_KEY, label: 'Instance types' },
  { key: ZONE_KEY, label: 'Availability zones' },
];

/**
 * `consolidateAfter: Never` disables consolidation whatever the policy says, so
 * report that instead of emitting the nonsense "after Never".
 */
function describeConsolidation(
  policy: string,
  consolidateAfter: string | undefined,
): string {
  if (consolidateAfter === 'Never') {
    return `${policy} \u2014 disabled (consolidateAfter: Never)`;
  }
  if (consolidateAfter) {
    return `${policy}, after ${formatGoDuration(consolidateAfter)}`;
  }
  return policy;
}

interface NodePoolConfigurationProps {
  pool: KarpenterMachinePool | undefined;
  nodePoolName: string;
  status: KarpenterNodePoolStatus | undefined;
}

export const NodePoolConfiguration = ({
  pool,
  nodePoolName,
  status,
}: NodePoolConfigurationProps) => {
  if (!pool) {
    return (
      <Text variant="body-medium" color="secondary">
        {`Karpenter configuration unavailable — the KarpenterMachinePool "${nodePoolName}" could not be read.`}
      </Text>
    );
  }

  const entries = parseRequirements(pool.getRequirements());
  const hasNodeClass = pool.getEC2NodeClassSpec() !== undefined;

  const running: Record<string, MixEntry[] | undefined> = {
    [CAPACITY_TYPE_KEY]: status?.capacityTypes,
    [ARCH_KEY]: status?.architectures,
    [INSTANCE_FAMILY_KEY]: status?.instanceFamilies,
    [INSTANCE_TYPE_KEY]: status?.instanceTypes,
    [ZONE_KEY]: status?.zones,
  };

  const comparedRows: EnvelopeRow[] = COMPARED_KEYS.map(({ key, label }) => ({
    key,
    label,
    entry: findRequirementEntry(entries, key),
    running: running[key],
  }));

  // Everything else the pool constrains, kept rather than hidden — Karpenter
  // and its cloud providers add requirement keys over time.
  const otherRows: EnvelopeRow[] = entries
    .filter(entry => !COMPARED_KEYS.some(c => c.key === entry.key))
    .map(entry => ({
      key: entry.key,
      label: entry.label,
      entry,
      running: undefined,
    }));

  const lifecycle: Fact[] = [];
  const policy = formatConsolidationPolicy(pool.getConsolidationPolicy());
  if (policy) {
    lifecycle.push({
      label: 'Consolidation',
      value: describeConsolidation(policy, pool.getConsolidateAfter()),
    });
  }
  lifecycle.push({
    label: 'Expire after',
    value: formatGoDuration(pool.getExpireAfter()) ?? 'Never',
  });
  const grace = formatGoDuration(pool.getTerminationGracePeriod());
  if (grace) {
    lifecycle.push({ label: 'Termination grace', value: grace });
  }
  const budgets = pool.getDisruptionBudgets();
  lifecycle.push({
    label: 'Disruption budgets',
    value:
      budgets.length === 0
        ? 'Default (10% of nodes)'
        : budgets
            .map(b => {
              const parts = [`${b.nodes} nodes`];
              if (b.schedule) parts.push(`on \`${b.schedule}\``);
              const d = formatGoDuration(b.duration);
              if (d) parts.push(`for ${d}`);
              if (b.reasons?.length) parts.push(`(${b.reasons.join(', ')})`);
              return parts.join(' ');
            })
            .join(' · '),
  });
  if (status?.allowedDisruptions !== undefined) {
    lifecycle.push({
      label: 'Disruptable now',
      value: `${status.allowedDisruptions} ${status.allowedDisruptions === 1 ? 'node' : 'nodes'}`,
    });
  }
  const weight = pool.getWeight();
  lifecycle.push({
    label: 'Scheduling weight',
    value: weight === undefined ? 'Unset (0)' : String(weight),
  });

  const template: Fact[] = [];
  const amiFamily = pool.getAmiFamily();
  const aliases = pool.getAmiAliases();
  template.push({
    label: 'Node image',
    value:
      [amiFamily, aliases.length ? aliases.join(', ') : undefined]
        .filter(Boolean)
        .join(' · ') || 'Defaults',
  });
  const root = pool.getRootVolume();
  const rootParts = [
    root?.ebs?.volumeSize,
    root?.ebs?.volumeType,
    root?.ebs?.encrypted ? 'encrypted' : undefined,
  ].filter(Boolean);
  template.push({
    label: 'Root volume',
    value: rootParts.length ? rootParts.join(', ') : 'Defaults from the image',
  });
  const maxPods = pool.getKubeletConfig()?.maxPods;
  if (maxPods !== undefined) {
    template.push({ label: 'Max pods per node', value: String(maxPods) });
  }
  const storePolicy = pool.getInstanceStorePolicy();
  if (storePolicy) {
    template.push({ label: 'Instance store', value: storePolicy });
  }
  template.push({
    label: 'Detailed monitoring',
    value: pool.getDetailedMonitoring() ? 'On' : 'Off',
  });
  const role = pool.getIamRole() ?? pool.getInstanceProfile();
  if (role) {
    template.push({ label: 'IAM role', value: role });
  }
  const taints = [...pool.getTaints(), ...pool.getStartupTaints()];
  if (taints.length) {
    template.push({
      label: `Taints (${taints.length})`,
      value: (
        <Flex direction="column" gap="0.5">
          {taints.map((t, i) => (
            <Text key={i} variant="body-small">
              {`${t.key}${t.value ? `=${t.value}` : ''}:${t.effect}`}
            </Text>
          ))}
        </Flex>
      ),
    });
  }

  // Limits are shown as meters in the summary when metrics supply them; fall
  // back to the CR's own values when they don't.
  const configuredLimits = formatLimits(pool.getLimits());
  const hasMeteredLimits = Object.keys(status?.limits ?? {}).length > 0;

  return (
    <Flex direction="column" gap="4">
      <InfoCard title="Running now">
        <Flex direction="column" gap="4">
          <RunningSummary
            status={status}
            fallbackNodeCount={
              pool.getProviderIDs().length || pool.getReplicas()
            }
          />
          {!hasMeteredLimits && configuredLimits.length > 0 && (
            <FactList
              facts={configuredLimits.map(limit => ({
                label: `${formatResourceName(limit.resource)} limit`,
                value: limit.value,
              }))}
            />
          )}
          {!hasMeteredLimits && configuredLimits.length === 0 && (
            <Text variant="body-small" color="secondary">
              No provisioning limits set — this pool is unlimited.
            </Text>
          )}
        </Flex>
      </InfoCard>

      <InfoCard title="Provisioning envelope">
        {comparedRows.length === 0 && otherRows.length === 0 ? (
          <Text variant="body-small" color="secondary">
            No requirements set — any instance type is allowed.
          </Text>
        ) : (
          <EnvelopeTable rows={[...comparedRows, ...otherRows]} />
        )}
      </InfoCard>

      <Grid.Root
        columns={{ xs: '1', md: '2' }}
        gap="4"
        style={{ alignItems: 'start' }}
      >
        <Grid.Item>
          <InfoCard title="Lifecycle and disruption">
            <FactList facts={lifecycle} />
          </InfoCard>
        </Grid.Item>
        {hasNodeClass && (
          <Grid.Item>
            <InfoCard title="Node template">
              <FactList facts={template} />
            </InfoCard>
          </Grid.Item>
        )}
      </Grid.Root>
    </Flex>
  );
};
