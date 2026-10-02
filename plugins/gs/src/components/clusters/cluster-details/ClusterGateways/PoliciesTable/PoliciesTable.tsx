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
import {
  GatewayPolicy,
  isPolicyBroken,
  isPolicyUnattached,
} from '../../../../hooks/gatewayPolicies';
import { ConditionStatus } from '../ConditionStatus';

type PolicyRow = GatewayPolicy;

function statusUnavailable(policy: GatewayPolicy): boolean {
  return (
    policy.ancestors.length === 0 && policy.status.status === 'not-available'
  );
}

function targetsLabel(policy: GatewayPolicy): string {
  if (policy.targets.length === 0) {
    return statusUnavailable(policy) ? 'Not available' : '—';
  }
  return policy.targets
    .map(
      t => `${t.kind}/${t.name}${t.sectionName ? ` · ${t.sectionName}` : ''}`,
    )
    .join(', ');
}

function StatusCell({ policy }: { policy: GatewayPolicy }) {
  if (policy.ancestors.length > 0) {
    return (
      <Flex direction="column" gap="1">
        {policy.ancestors.map(ancestor => (
          <Flex
            key={`${ancestor.kind}/${ancestor.namespace}/${ancestor.name}/${ancestor.sectionName}`}
            align="center"
            gap="2"
          >
            <Text variant="body-medium" color="secondary">
              {ancestor.kind && ancestor.kind !== 'Gateway'
                ? `${ancestor.kind}/`
                : ''}
              {ancestor.name}
              {ancestor.sectionName ? ` · ${ancestor.sectionName}` : ''}
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

const columns: ColumnConfig<PolicyRow>[] = [
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
      <Alert
        status="warning"
        icon
        title="Envoy Gateway policies could not be loaded."
        description={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const unavailable = !isLoading && policies.some(statusUnavailable);

  return (
    <Flex direction="column" gap="2">
      {unavailable ? (
        <Alert
          status="info"
          icon
          title="Some policy targets and status are not available on this cluster."
          description="Either they could not be loaded, or the cluster runs an observability-bundle that doesn't export them yet. Policies using the deprecated targetRef still show their target."
        />
      ) : null}
      <Table<PolicyRow>
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
