import { Link as RouterLink } from 'react-router-dom';
import { Link, TableColumn } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Box, Typography } from '@material-ui/core';
import { isTableColumnHidden } from '@giantswarm/backstage-plugin-ui-react';
import { workflowDetailRouteRef } from '../../../routes';
import { matchesQuery } from '../../../lib/workflowSearch';
import { AvailabilityBadge, StateBadge } from '../../shared';
import { WorkflowRow } from '../WorkflowsDataProvider';

const SOURCE_LABELS: Record<WorkflowRow['source'], string> = {
  gitops: 'gitops',
  manual: 'manually added',
};

export const WorkflowColumns = {
  name: 'name',
  namespace: 'namespace',
  stepCount: 'stepCount',
  available: 'available',
  source: 'source',
} as const;

const NAME_MAX_LENGTH = 55;

const WorkflowNameCell = ({ row }: { row: WorkflowRow }) => {
  const detailLink = useRouteRef(workflowDetailRouteRef);
  const base = detailLink?.({ name: row.name }) ?? '#';
  const to = row.cluster
    ? `${base}?installation=${encodeURIComponent(row.cluster)}`
    : base;

  const displayName =
    row.name.length > NAME_MAX_LENGTH
      ? `${row.name.slice(0, NAME_MAX_LENGTH)}…`
      : row.name;

  return (
    <Box>
      <Link component={RouterLink} to={to} title={row.name}>
        <Typography variant="inherit" noWrap>
          {displayName}
        </Typography>
      </Link>
      {row.description && (
        <Typography
          variant="body2"
          color="textSecondary"
          style={{
            marginTop: 4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            maxWidth: 460,
          }}
        >
          {row.description}
        </Typography>
      )}
    </Box>
  );
};

export const getInitialColumns = ({
  visibleColumns,
}: {
  visibleColumns: string[];
}): TableColumn<WorkflowRow>[] => {
  const columns: TableColumn<WorkflowRow>[] = [
    {
      title: 'Name',
      field: WorkflowColumns.name,
      highlight: true,
      defaultSort: 'asc',
      render: row => <WorkflowNameCell row={row} />,
      // The description is shown under the name, so keep it searchable here.
      // Token-boundary matching ("dex" must not match "index"); see
      // workflowSearch.ts.
      customFilterAndSearch: (query, row) =>
        matchesQuery(query, `${row.name} ${row.description}`),
    },
    {
      title: 'Namespace',
      field: WorkflowColumns.namespace,
      render: row => <>{row.namespace || '-'}</>,
    },
    {
      title: 'Steps',
      field: WorkflowColumns.stepCount,
      type: 'numeric',
    },
    {
      title: 'Available',
      field: WorkflowColumns.available,
      searchable: false,
      customSort: (a, b) => Number(a.available) - Number(b.available),
      render: row => (
        <Box display="flex" flexWrap="wrap" gridGap={4}>
          <AvailabilityBadge available={row.available} />
          {row.validationWarning && (
            <StateBadge tone="warning" label="Validation warning" />
          )}
        </Box>
      ),
    },
    {
      title: 'Source',
      field: WorkflowColumns.source,
      // Default search matches the raw `row.source` ("gitops"/"manual"); match
      // the displayed label instead so "manually added" / "gitops" find rows.
      customFilterAndSearch: (query, row) =>
        SOURCE_LABELS[row.source].includes(query.toLowerCase()),
      render: row =>
        row.source === 'gitops' ? (
          <StateBadge tone="info" label="GitOps" />
        ) : (
          <StateBadge tone="neutral" label="Manually added" />
        ),
    },
  ];

  return columns.map(column => ({
    ...column,
    hidden: isTableColumnHidden(column.field, {
      defaultValue: Boolean(column.hidden),
      visibleColumns,
    }),
  }));
};
