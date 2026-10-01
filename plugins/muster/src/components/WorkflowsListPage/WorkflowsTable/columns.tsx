import { Link as RouterLink } from 'react-router-dom';
import { Link, TableColumn } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Box, Typography, useTheme } from '@material-ui/core';
import Check from '@material-ui/icons/Check';
import Remove from '@material-ui/icons/Remove';
import { Flex } from '@backstage/ui';
import {
  GitOpsIcon,
  isTableColumnHidden,
  matchesQuery,
  NotAvailable,
} from '@giantswarm/backstage-plugin-ui-react';
import { workflowDetailRouteRef } from '../../../routes';
import { StateBadge, toneColors } from '../../shared';
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

// The table's cells read as text, not pills: the icon carries the state.
const ICON_STYLE = { fontSize: 16 };

const AvailabilityCell = ({ available }: { available: boolean }) => {
  const theme = useTheme();
  return (
    <Flex
      align="center"
      gap="1"
      style={{
        color: available
          ? toneColors(theme, 'ok').text
          : theme.palette.text.secondary,
      }}
    >
      {available ? <Check style={ICON_STYLE} /> : <Remove style={ICON_STYLE} />}
      {available ? 'Available' : 'Unavailable'}
    </Flex>
  );
};

const SourceCell = ({ source }: { source: WorkflowRow['source'] }) =>
  source === 'gitops' ? (
    <Flex align="center" gap="1">
      <GitOpsIcon style={ICON_STYLE} />
      GitOps
    </Flex>
  ) : (
    <>Manually added</>
  );

const WorkflowNameCell = ({ row }: { row: WorkflowRow }) => {
  const detailLink = useRouteRef(workflowDetailRouteRef);
  const base = detailLink?.({ name: row.name }) ?? '#';
  const to = row.cluster
    ? `${base}?installation=${encodeURIComponent(row.cluster)}`
    : base;

  return (
    <Box>
      {/* `noWrap` truncates with a CSS ellipsis to the (table-layout: fixed)
          cell width -- responsive, so a long name shows in full on a wide
          viewport and truncates only when the column is narrow. The full name
          stays in the link title. */}
      <Link
        component={RouterLink}
        to={to}
        title={row.name}
        noWrap
        display="block"
      >
        {row.name}
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
      // Let the Name/description column absorb the remaining width; the other
      // columns are given fixed widths below.
      width: 'auto',
      render: row => <WorkflowNameCell row={row} />,
      // The description is shown under the name, so keep it searchable here.
      // Token-boundary matching ("dex" must not match "index"); see
      // ui-react's tokenSearch.ts.
      customFilterAndSearch: (query, row) =>
        matchesQuery(query, `${row.name} ${row.description}`),
    },
    {
      title: 'Namespace',
      field: WorkflowColumns.namespace,
      width: '15%',
      render: row => (row.namespace ? <>{row.namespace}</> : <NotAvailable />),
    },
    {
      title: 'Steps',
      field: WorkflowColumns.stepCount,
      type: 'numeric',
      width: '8%',
    },
    {
      title: 'Available',
      field: WorkflowColumns.available,
      searchable: false,
      width: '12%',
      customSort: (a, b) => Number(a.available) - Number(b.available),
      render: row => (
        <Box display="flex" flexWrap="wrap" gridGap={4}>
          <AvailabilityCell available={row.available} />
          {row.validationWarning && (
            <StateBadge tone="warning" label="Validation warning" />
          )}
        </Box>
      ),
    },
    {
      title: 'Source',
      field: WorkflowColumns.source,
      width: '10%',
      // Default search matches the raw `row.source` ("gitops"/"manual"); match
      // the displayed label instead so "manually added" / "gitops" find rows.
      customFilterAndSearch: (query, row) =>
        SOURCE_LABELS[row.source].includes(query.toLowerCase()),
      render: row => <SourceCell source={row.source} />,
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
