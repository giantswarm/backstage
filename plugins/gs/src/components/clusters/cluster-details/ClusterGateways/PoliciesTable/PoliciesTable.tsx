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
  MetricsUnavailableAlert,
  StackedRowList,
  useFittingColumns,
  type FittingTier,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  GatewayPolicy,
  PolicyAncestor,
  isPolicyBroken,
  isPolicyUnattached,
} from '../../../../utils/gatewayPolicies';
import {
  ConditionState,
  unavailableCauseOf,
} from '../../../../utils/gatewayTopology';
import { ConditionStatus } from '../ConditionStatus';
import { conditionValue, worstCondition } from '../conditions';

/** A name that wraps where the column is too narrow, rather than being cut. */
const wrapping = { minWidth: 0, overflowWrap: 'anywhere' } as const;

const UNATTACHED_REASON =
  'Target missing, not managed by Envoy Gateway, or not reconciled yet';

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

/** True when a policy without targets may have some that were not read. */
function targetsUnknown(policy: GatewayPolicy): boolean {
  return !policy.targetsLoaded || statusUnavailable(policy);
}

function targetsLabel(policy: GatewayPolicy): string {
  if (policy.targets.length === 0) {
    // Inferred, not read: without targetRef and targetRefs a policy must use
    // targetSelectors, which aren't exported.
    return targetsUnknown(policy) ? 'Not available' : 'Selected by labels';
  }
  return policy.targets
    .map(
      t => `${t.kind}/${t.name}${t.sectionName ? ` · ${t.sectionName}` : ''}`,
    )
    .join(', ');
}

/** The targets as a stacked row's fact: `targets HTTPRoute/shop (https)`. */
function targetsFact(policy: GatewayPolicy): string {
  if (policy.targets.length === 0) {
    return targetsUnknown(policy)
      ? 'targets not available'
      : 'targets selected by labels';
  }
  return `targets ${policy.targets
    .map(
      t => `${t.kind}/${t.name}${t.sectionName ? ` (${t.sectionName})` : ''}`,
    )
    .join(', ')}`;
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
        {/* The ancestor wraps where it must; its status stays whole. */}
        {policy.ancestors.map(ancestor => (
          <Flex key={ancestor.id} align="start" gap="2" style={{ minWidth: 0 }}>
            <Text variant="body-medium" color="secondary" style={wrapping}>
              {ancestorLabel(ancestor)}
            </Text>
            {/* Whole for a short status; a long reason wraps between its
                words within half the column rather than squeeze the name. */}
            <div style={{ flex: '0 0 auto', maxWidth: '50%' }}>
              <ConditionStatus condition={ancestor.accepted} />
            </div>
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
            {UNATTACHED_REASON}
          </Text>
        </Flex>
      </Flex>
    );
  }
  return <ConditionStatus condition={policy.status} />;
}

/**
 * The minimum width of each column: a header and the usual value whole
 * (the longest kind, "No status reported" with its icon, an ancestor beside
 * "Invalid"). Above them, the status gets the largest share, so an
 * ancestor stays on one line where there is room.
 */
export const POLICY_MIN_WIDTHS: Readonly<Record<string, number>> = {
  policy: 160,
  kind: 180,
  targets: 160,
  status: 280,
};

/** Narrower, the kind leaves the table for the policy's description. */
const POLICY_DROP_FIRST: readonly string[] = ['kind'];

/**
 * Compact, only the loading table uses the columns (the rows stack): narrow
 * enough for a phone.
 */
const POLICY_COMPACT_MIN_WIDTHS: Readonly<Record<string, number>> = {
  policy: 120,
  status: 140,
};

/** The policies table's columns, for `useFittingColumns`. */
export function policyColumnsFor(
  tier: FittingTier,
): ColumnConfig<GatewayPolicy>[] {
  const policy: ColumnConfig<GatewayPolicy> = {
    id: 'policy',
    defaultWidth: '1fr',
    label: 'Policy',
    isRowHeader: true,
    cell: row => (
      <CellText
        title={row.name}
        description={
          // The kind first: a long namespace would push it into the ellipsis.
          tier === 'full' ? row.namespace : `${row.kind} · ${row.namespace}`
        }
      />
    ),
  };
  const status: ColumnConfig<GatewayPolicy> = {
    id: 'status',
    defaultWidth: '1.8fr',
    label: 'Accepted by',
    cell: row => (
      <Cell>
        <StatusCell policy={row} />
      </Cell>
    ),
  };
  // Compact, the rows stack; only the loading table uses these.
  if (tier === 'compact') return [policy, status];
  return [
    policy,
    {
      id: 'kind',
      defaultWidth: '0.8fr',
      label: 'Kind',
      cell: row => <CellText title={row.kind} />,
    },
    {
      id: 'targets',
      defaultWidth: '1fr',
      label: 'Targets',
      cell: row => <CellText title={targetsLabel(row)} />,
    },
    status,
  ];
}

/** The status next to a stacked policy's name: the worst ancestor's. */
function rowStatus(policy: GatewayPolicy) {
  if (isPolicyUnattached(policy)) {
    return (
      <Flex align="center" gap="1">
        <StatusWarning />
        <Text variant="body-medium">No status reported</Text>
      </Flex>
    );
  }
  const shown = worstCondition(
    policy.ancestors.length
      ? policy.ancestors.map(ancestor => ({
          name: 'Accepted',
          condition: ancestor.accepted,
        }))
      : [{ name: 'Accepted', condition: policy.status }],
  )!;
  return <ConditionStatus condition={shown.condition} name={shown.name} />;
}

/** Under a stacked policy: each ancestor with its status, or why none. */
function rowDetails(policy: GatewayPolicy) {
  if (isPolicyUnattached(policy)) return UNATTACHED_REASON;
  if (!policy.ancestors.length) return undefined;
  return (
    <Flex direction="column" gap="1">
      {policy.ancestors.map(ancestor => (
        <Text key={ancestor.id} variant="body-small">
          {`Accepted by ${ancestorLabel(ancestor)}: ${conditionValue(
            ancestor.accepted,
          )}`}
        </Text>
      ))}
    </Flex>
  );
}

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
  const fit = useFittingColumns(policyColumnsFor, {
    minWidths: POLICY_MIN_WIDTHS,
    dropFirst: POLICY_DROP_FIRST,
    compactMinWidths: POLICY_COMPACT_MIN_WIDTHS,
  });

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
  const emptyState = (
    <Text variant="body-medium" color="secondary">
      No Envoy Gateway policies found on cluster <code>{clusterName}</code>.
    </Text>
  );

  return (
    <Flex direction="column" gap="2">
      {unavailable ? (
        <Alert status="info" icon title={unavailableNotice[unavailable]} />
      ) : null}
      <div ref={fit.ref}>
        {fit.isCompact && !isLoading ? (
          <StackedRowList
            aria-label="Envoy Gateway policies"
            emptyState={emptyState}
            rows={rows.map(policy => ({
              id: policy.id,
              title: policy.name,
              status: rowStatus(policy),
              facts: [policy.namespace, policy.kind, targetsFact(policy)],
              details: rowDetails(policy),
            }))}
          />
        ) : (
          <Table<GatewayPolicy>
            columnConfig={fit.columns}
            data={isLoading ? undefined : rows}
            isPending={isLoading}
            pagination={{ type: 'none' }}
            emptyState={emptyState}
          />
        )}
      </div>
    </Flex>
  );
};
