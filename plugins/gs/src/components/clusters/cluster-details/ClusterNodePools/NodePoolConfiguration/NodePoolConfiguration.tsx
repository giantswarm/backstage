import { Flex, Grid, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { KarpenterMachinePool } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type Fact,
  FactList,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';
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

const useStyles = makeStyles({
  // Taints are literal Kubernetes strings — key=value:Effect — so they read as
  // code rather than prose, and the monospace makes the delimiters legible.
  code: {
    fontFamily: '"Roboto Mono", monospace',
    fontSize: 'var(--bui-font-size-2)',
    lineHeight: 1.5,
    color: 'var(--bui-fg-primary)',
    overflowWrap: 'anywhere',
  },
});

/**
 * `consolidateAfter: Never` disables consolidation whatever the policy says, so
 * report that instead of emitting the nonsense "after Never".
 */
function describeConsolidation(
  policy: string | undefined,
  consolidateAfter: string | undefined,
): string {
  // The CRD documents WhenEmptyOrUnderutilized as the default when unset.
  const effective = policy ?? 'When empty or underutilized (default)';

  if (consolidateAfter === 'Never') {
    return `${effective} \u2014 disabled (consolidateAfter: Never)`;
  }
  if (consolidateAfter) {
    return `${effective}, after ${formatGoDuration(consolidateAfter)}`;
  }
  return effective;
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
  const classes = useStyles();

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

  // `||` would treat a pool scaled to zero as unknown and render no figure at
  // all, rather than the accurate "0 nodes".
  const providerIds = pool.getProviderIDs();
  const fallbackNodes = providerIds.length
    ? providerIds.length
    : (pool.getReplicas() ?? 0);

  const lifecycle: Fact[] = [];
  // consolidationPolicy is optional and consolidateAfter is required, so a pool
  // may configure only the latter. Gating the row on the policy dropped it
  // entirely for those pools, saying nothing about consolidation while it was
  // active.
  lifecycle.push({
    label: 'Consolidation',
    value: describeConsolidation(
      formatConsolidationPolicy(pool.getConsolidationPolicy()),
      pool.getConsolidateAfter(),
    ),
  });
  // An absent expireAfter is not "Never" — the upstream CRD defaults it — so
  // report that it is unset rather than asserting nodes are never recycled.
  lifecycle.push({
    label: 'Expire after',
    value: formatGoDuration(pool.getExpireAfter()) ?? 'Not set (CRD default)',
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
              if (b.schedule) parts.push(`on ${b.schedule}`);
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
            <code key={i} className={classes.code}>
              {`${t.key}${t.value ? `=${t.value}` : ''}:${t.effect}`}
            </code>
          ))}
        </Flex>
      ),
    });
  }

  // Limits are shown as meters in the summary when metrics supply them; fall
  // back to the CR's own values when they don't.
  // The meters only cover resources Mimir reported. Falling back for *all*
  // resources whenever any one was metered would hide the rest — a pool with a
  // GPU limit and a metered CPU limit would drop the GPU limit entirely.
  const meteredResources = new Set(Object.keys(status?.limits ?? {}));
  const unmeteredLimits = formatLimits(pool.getLimits()).filter(
    limit => !meteredResources.has(limit.resource),
  );
  const hasAnyLimit = meteredResources.size > 0 || unmeteredLimits.length > 0;

  return (
    <Flex direction="column" gap="4">
      <InfoCard title="Running now">
        <Flex direction="column" gap="4">
          <RunningSummary status={status} fallbackNodeCount={fallbackNodes} />
          {unmeteredLimits.length > 0 && (
            <FactList
              facts={unmeteredLimits.map(limit => ({
                label: `${formatResourceName(limit.resource)} limit`,
                value: limit.value,
              }))}
            />
          )}
          {!hasAnyLimit && (
            <Text variant="body-small" color="secondary">
              No provisioning limits set — this pool is unlimited.
            </Text>
          )}
        </Flex>
      </InfoCard>

      <InfoCard title="Provisioning envelope">
        {entries.length === 0 ? (
          <Text variant="body-small" color="secondary">
            No requirements set — any instance type is allowed.
          </Text>
        ) : (
          <EnvelopeTable rows={[...comparedRows, ...otherRows]} />
        )}
      </InfoCard>

      <Grid.Root columns={{ xs: '1', md: '2' }} gap="4">
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
