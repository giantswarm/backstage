import { useMemo } from 'react';
import { StatusWarning } from '@backstage/core-components';
import {
  Alert,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
} from '@backstage/ui';
import { MetricsUnavailableAlert } from '@giantswarm/backstage-plugin-ui-react';
import {
  GatewayPolicy,
  PolicyAncestor,
  isPolicyBroken,
  isPolicyUnattached,
} from '../../../../hooks/gatewayPolicies';
import {
  ConditionState,
  unavailableCauseOf,
} from '../../../../hooks/gatewayTopology';
import { ConditionStatus } from '../ConditionStatus';

function statusUnavailable(policy: GatewayPolicy): policy is GatewayPolicy & {
  status: Extract<ConditionState, { status: 'not-available' }>;
} {
  return (
    policy.ancestors.length === 0 && policy.status.status === 'not-available'
  );
}

/** Why targets or status can't be shown, if any can't. */
function unavailableCause(policies: GatewayPolicy[]) {
  return unavailableCauseOf(
    policies.flatMap((policy): ConditionState[] => [
      ...(policy.targetsLoaded
        ? []
        : [
            { status: 'not-available' as const, cause: 'load-failed' as const },
          ]),
      ...(statusUnavailable(policy) ? [policy.status] : []),
    ]),
  );
}

const unavailableNotice = {
  'load-failed':
    'Some policy targets or status could not be loaded. They are retried automatically.',
  // A cluster on 3.6.0 whose policies all use targetRef or targetSelectors and
  // resolved no ancestor looks the same, so the notice names both.
  'not-exported':
    'Policy status is not available on this cluster. It needs observability-bundle 3.6.0 or newer, as do targets set with targetRefs. If the bundle is newer, Envoy Gateway has reported no status for these policies yet.',
};

function targetsLabel(policy: GatewayPolicy): string {
  if (policy.targets.length === 0) {
    // Inferred, not read: without targetRef and targetRefs a policy must use
    // targetSelectors, which aren't exported.
    return !policy.targetsLoaded || statusUnavailable(policy)
      ? 'Not available'
      : 'Selected by labels';
  }
  return policy.targets
    .map(
      t => `${t.kind}/${t.name}${t.sectionName ? ` · ${t.sectionName}` : ''}`,
    )
    .join(', ');
}

/** `envoy-gateway-system/public · https · port 443`; the kind unless Gateway. */
function ancestorLabel(ancestor: PolicyAncestor): string {
  const kind =
    ancestor.kind && ancestor.kind !== 'Gateway' ? `${ancestor.kind} ` : '';
  const name = ancestor.namespace
    ? `${ancestor.namespace}/${ancestor.name}`
    : ancestor.name;
  return [
    `${kind}${name}`,
    ancestor.sectionName,
    ancestor.port ? `port ${ancestor.port}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function StatusCell({ policy }: { policy: GatewayPolicy }) {
  if (policy.ancestors.length > 0) {
    return (
      <Flex direction="column" gap="1">
        {policy.ancestors.map(ancestor => (
          <Flex key={ancestor.id} align="center" gap="2">
            <Text variant="body-medium" color="secondary">
              {ancestorLabel(ancestor)}
            </Text>
            <ConditionStatus condition={ancestor.accepted} />
          </Flex>
        ))}
      </Flex>
    );
  }
  if (isPolicyUnattached(policy)) {
    return (
      <Flex align="center" gap="1">
        <StatusWarning />
        <Flex direction="column">
          <Text variant="body-medium">No status reported</Text>
          <Text variant="body-small" color="secondary">
            Target missing, not managed by Envoy Gateway, or not reconciled yet
          </Text>
        </Flex>
      </Flex>
    );
  }
  return <ConditionStatus condition={policy.status} />;
}

const columns: ColumnConfig<GatewayPolicy>[] = [
  {
    id: 'policy',
    label: 'Policy',
    isRowHeader: true,
    cell: row => <CellText title={row.name} description={row.namespace} />,
  },
  {
    id: 'kind',
    label: 'Kind',
    cell: row => <CellText title={row.kind} />,
  },
  {
    id: 'targets',
    label: 'Targets',
    cell: row => <CellText title={targetsLabel(row)} />,
  },
  {
    id: 'status',
    label: 'Accepted by',
    cell: row => (
      <Cell>
        <StatusCell policy={row} />
      </Cell>
    ),
  },
];

/** Problems first: rejected policies, then policies without any status. */
function rank(policy: GatewayPolicy): number {
  if (isPolicyBroken(policy)) return 0;
  if (isPolicyUnattached(policy)) return 1;
  return 2;
}

export type PoliciesTableProps = {
  clusterName: string;
  policies: GatewayPolicy[];
  isLoading: boolean;
  error?: unknown;
};

export const PoliciesTable = ({
  clusterName,
  policies,
  isLoading,
  error,
}: PoliciesTableProps) => {
  const rows = useMemo(
    () => [...policies].sort((a, b) => rank(a) - rank(b)),
    [policies],
  );

  if (error) {
    return (
      <MetricsUnavailableAlert
        error={error}
        title="Envoy Gateway policies could not be loaded."
        description={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const unavailable = isLoading ? undefined : unavailableCause(policies);

  return (
    <Flex direction="column" gap="2">
      {unavailable ? (
        <Alert status="info" icon title={unavailableNotice[unavailable]} />
      ) : null}
      <Table<GatewayPolicy>
        columnConfig={columns}
        data={isLoading ? undefined : rows}
        isPending={isLoading}
        pagination={{ type: 'none' }}
        emptyState={
          <Text variant="body-medium" color="secondary">
            No Envoy Gateway policies found on cluster{' '}
            <code>{clusterName}</code>.
          </Text>
        }
      />
    </Flex>
  );
};
