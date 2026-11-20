import { type ReactNode, useCallback } from 'react';
import { Cell, type ColumnConfig, Table, Text } from '@backstage/ui';
import {
  type FittingTier,
  StackedRowList,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import type { GatewayPolicy, PolicyTarget } from '../../utils/gatewayPolicies';
import { PlatformCellLines } from '../PlatformCellLines';
import { PlatformGatewayStatus } from '../PlatformGatewayStatus';
import { PlatformMarkedText } from '../PlatformMarkedText';
import { useGatewayTableStyles } from '../hooks';
import {
  type GatewayPolicyRow,
  isTargetGateway,
  policyMatches,
  policyStatus,
} from '../utils/gateways';

/**
 * Each column's least width, in px: its header and its usual content, the
 * longest kind ("BackendTrafficPolicy"), "No status reported" with its dot.
 */
const MIN_WIDTHS: Record<string, number> = {
  policy: 180,
  kind: 170,
  target: 160,
  status: 170,
};

/** Left out first, its value named under the policy. */
const DROP_FIRST = ['kind'] as const;

/** What a target is, under its name: `This gateway`, `HTTP route · https`. */
function targetKind(target: PolicyTarget, row: GatewayPolicyRow): string {
  let kind = target.kind;
  if (target.kind === 'HTTPRoute') kind = 'HTTP route';
  if (isTargetGateway(target, row.policy, row.gateway)) {
    kind = 'This gateway';
  }
  return target.sectionName ? `${kind} · ${target.sectionName}` : kind;
}

/**
 * Without targets, a policy selects them by labels, which aren't exported,
 * unless its targets or status could not be read.
 */
function noTargetsText(policy: GatewayPolicy): string {
  const unknown =
    !policy.targetsLoaded ||
    (policy.ancestors.length === 0 && policy.status.status === 'not-available');
  return unknown ? 'Not available' : 'Selected by labels';
}

function Targets({ row }: { row: GatewayPolicyRow }) {
  const { targets } = row.policy;
  if (targets.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        {noTargetsText(row.policy)}
      </Text>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {targets.map(target => (
        <PlatformCellLines
          key={`${target.kind}/${target.name}/${target.sectionName ?? ''}`}
          title={target.name}
          description={targetKind(target, row)}
        />
      ))}
    </div>
  );
}

function targetsText(row: GatewayPolicyRow): string {
  const { targets } = row.policy;
  if (targets.length === 0) return noTargetsText(row.policy).toLowerCase();
  return `applies to ${targets
    .map(target => `${target.name} (${targetKind(target, row)})`)
    .join(', ')}`;
}

export type PlatformGatewayPoliciesTableProps = {
  rows: GatewayPolicyRow[];
  query: string;
  'aria-label': string;
  emptyState: ReactNode;
};

/**
 * Envoy Gateway policies: the policy with its namespace, its kind, what it
 * applies to, and its status on the Gateway shown (the worst of its
 * statuses, where no Gateway is). Narrower, the kind goes under the policy;
 * then the rows stack.
 */
export function PlatformGatewayPoliciesTable({
  rows,
  query,
  'aria-label': ariaLabel,
  emptyState,
}: PlatformGatewayPoliciesTableProps) {
  const classes = useGatewayTableStyles();
  const name = useCallback(
    (row: GatewayPolicyRow) =>
      policyMatches(row.policy, query) ? (
        <PlatformMarkedText text={row.policy.name} query={query} />
      ) : (
        row.policy.name
      ),
    [query],
  );

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<GatewayPolicyRow>[] => [
      {
        id: 'policy',
        label: 'Policy',
        isRowHeader: true,
        defaultWidth: '1.2fr',
        cell: row => (
          <Cell>
            <PlatformCellLines
              title={name(row)}
              description={
                tier === 'full'
                  ? row.policy.namespace
                  : `${row.policy.kind} · ${row.policy.namespace}`
              }
            />
          </Cell>
        ),
      },
      {
        id: 'kind',
        label: 'Kind',
        defaultWidth: '1fr',
        cell: row => (
          <Cell>
            <Text variant="body-medium">{row.policy.kind}</Text>
          </Cell>
        ),
      },
      {
        id: 'target',
        label: 'Applies to',
        defaultWidth: '1fr',
        cell: row => (
          <Cell>
            <Targets row={row} />
          </Cell>
        ),
      },
      {
        id: 'status',
        label: 'Status',
        defaultWidth: '0.9fr',
        cell: row => (
          <Cell>
            <PlatformGatewayStatus status={policyStatus(row)} />
          </Cell>
        ),
      },
    ],
    [name],
  );

  const fit = useFittingColumns(columnsFor, {
    minWidths: MIN_WIDTHS,
    dropFirst: DROP_FIRST,
  });

  return (
    <div ref={fit.ref} className={`${classes.table} ${classes.marksRows}`}>
      {fit.isCompact ? (
        <StackedRowList
          aria-label={ariaLabel}
          emptyState={emptyState}
          rows={rows.map(row => ({
            id: row.id,
            title: name(row),
            status: <PlatformGatewayStatus status={policyStatus(row)} />,
            facts: [row.policy.namespace, row.policy.kind, targetsText(row)],
          }))}
        />
      ) : (
        <Table<GatewayPolicyRow>
          columnConfig={fit.columns}
          data={rows}
          pagination={{ type: 'none' }}
          emptyState={emptyState}
        />
      )}
    </div>
  );
}
