import { Cell, CellText, ColumnConfig, Flex, Table, Text } from '@backstage/ui';
import {
  MetricsUnavailableAlert,
  StackedRowList,
  useFittingColumns,
  type FittingTier,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  ReferenceGrant,
  ReferenceGrantEntry,
  referenceGrantFromEntry,
  referenceGrantToEntry,
} from '../../../../utils/gatewayReferenceGrants';

/** A name that wraps where the column is too narrow, rather than being cut. */
const wrapping = { minWidth: 0, overflowWrap: 'anywhere' } as const;

/** One entry per line, each wrapping on its own. */
function EntryList({ entries }: { entries: ReferenceGrantEntry[] }) {
  if (!entries.length) {
    return (
      <Text variant="body-medium" color="secondary">
        Not reported
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="1">
      {entries.map(entry => (
        <Text key={entry.key} variant="body-medium" style={wrapping}>
          {entry.label}
        </Text>
      ))}
    </Flex>
  );
}

/**
 * The minimum width of each column: a header and the usual entry whole
 * ("HTTPRoute in monitoring", "Service alloy-logexporter").
 */
export const REFERENCE_GRANT_MIN_WIDTHS: Readonly<Record<string, number>> = {
  grant: 160,
  from: 180,
  to: 180,
};

/**
 * Compact, only the loading table uses the columns (the rows stack): narrow
 * enough for a phone.
 */
const REFERENCE_GRANT_COMPACT_MIN_WIDTHS: Readonly<Record<string, number>> = {
  grant: 120,
  from: 140,
};

/** The ReferenceGrants table's columns, for `useFittingColumns`. */
export function referenceGrantColumnsFor(
  tier: FittingTier,
): ColumnConfig<ReferenceGrant>[] {
  const grant: ColumnConfig<ReferenceGrant> = {
    id: 'grant',
    defaultWidth: '1fr',
    label: 'ReferenceGrant',
    isRowHeader: true,
    cell: row => <CellText title={row.name} description={row.namespace} />,
  };
  const from: ColumnConfig<ReferenceGrant> = {
    id: 'from',
    defaultWidth: '1fr',
    label: 'From',
    cell: row => (
      <Cell>
        <EntryList entries={row.from.map(referenceGrantFromEntry)} />
      </Cell>
    ),
  };
  // Compact, the rows stack; only the loading table uses these.
  if (tier === 'compact') return [grant, from];
  return [
    grant,
    from,
    {
      id: 'to',
      defaultWidth: '1fr',
      label: 'To',
      cell: row => (
        <Cell>
          <EntryList entries={row.to.map(referenceGrantToEntry)} />
        </Cell>
      ),
    },
  ];
}

/** A stacked grant's facts: `from HTTPRoute in loki`, `to Service alloy`. */
function rowFacts(grant: ReferenceGrant): string[] {
  const list = (entries: ReferenceGrantEntry[]) =>
    entries.length
      ? entries.map(entry => entry.label).join(', ')
      : 'not reported';
  return [
    grant.namespace,
    `from ${list(grant.from.map(referenceGrantFromEntry))}`,
    `to ${list(grant.to.map(referenceGrantToEntry))}`,
  ];
}

export type ReferenceGrantsTableProps = {
  clusterName: string;
  referenceGrants: ReferenceGrant[];
  isLoading: boolean;
  error?: unknown;
};

export const ReferenceGrantsTable = ({
  clusterName,
  referenceGrants,
  isLoading,
  error,
}: ReferenceGrantsTableProps) => {
  const fit = useFittingColumns(referenceGrantColumnsFor, {
    minWidths: REFERENCE_GRANT_MIN_WIDTHS,
    compactMinWidths: REFERENCE_GRANT_COMPACT_MIN_WIDTHS,
  });

  if (error) {
    return (
      <MetricsUnavailableAlert
        error={error}
        title="ReferenceGrants could not be loaded."
        description={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const emptyState = (
    <Text variant="body-medium" color="secondary">
      No ReferenceGrants found on cluster <code>{clusterName}</code>. Clusters
      on observability-bundle older than 3.3.0 do not report them.
    </Text>
  );

  return (
    <Flex direction="column" gap="2">
      {/* Only above grants: an empty card says enough with its empty state. */}
      {!isLoading && referenceGrants.length > 0 ? (
        <Text variant="body-medium" color="secondary">
          A ReferenceGrant lets resources in other namespaces, such as routes,
          Gateways and policies, reference the listed resources in its own
          namespace. A route whose backend in another namespace has no matching
          grant reports ResolvedRefs: False · RefNotPermitted.
        </Text>
      ) : null}
      <div ref={fit.ref}>
        {fit.isCompact && !isLoading ? (
          <StackedRowList
            aria-label="ReferenceGrants"
            emptyState={emptyState}
            rows={referenceGrants.map(grant => ({
              id: grant.id,
              title: grant.name,
              facts: rowFacts(grant),
            }))}
          />
        ) : (
          <Table<ReferenceGrant>
            columnConfig={fit.columns}
            data={isLoading ? undefined : referenceGrants}
            isPending={isLoading}
            pagination={{ type: 'none' }}
            emptyState={emptyState}
          />
        )}
      </div>
    </Flex>
  );
};
