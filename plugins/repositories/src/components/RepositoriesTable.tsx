import { useMemo } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { Box, Chip, Typography } from '@material-ui/core';
import {
  DateComponent,
  NotAvailable,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import { RepositoryRow } from '../apis';
import {
  lifecycleOf,
  SETUP_INTENT,
  SETUP_ORDER,
  setupState,
} from '../lib/rows';
import { RepositoryDetails } from './RepositoryDetails';

/** A row as the table keeps it: material-table holds a row's state (its open detail panel) by `id`. */
type TableRow = RepositoryRow & { id: string };

const byName = (a: RepositoryRow, b: RepositoryRow) =>
  a.repository.localeCompare(b.repository, 'en', { sensitivity: 'base' });

const byText =
  (read: (row: RepositoryRow) => string) =>
  (a: RepositoryRow, b: RepositoryRow) =>
    read(a).localeCompare(read(b), 'en') || byName(a, b);

const byNumber =
  (read: (row: RepositoryRow) => number) =>
  (a: RepositoryRow, b: RepositoryRow) =>
    read(a) - read(b) || byName(a, b);

/** The repository without its org: every row of the inventory shares it. */
const nameOf = (row: RepositoryRow) => row.repository.replace(/^[^/]+\//, '');

/** A cell whose words stay on one line. */
const oneLine = { whiteSpace: 'nowrap' as const };

/** One line, cut with an ellipsis when the column is narrower (the full text is the title). */
const ellipsis = {
  ...oneLine,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
};

const columns: TableColumn<TableRow>[] = [
  {
    title: 'Repository',
    field: 'repository',
    highlight: true,
    defaultSort: 'asc',
    width: '30%',
    cellStyle: ellipsis,
    customSort: byName,
    render: row => (
      <span title={row.repository}>
        {nameOf(row)}
        {row.gone && (
          <Chip
            size="small"
            variant="outlined"
            label="gone from GitHub"
            style={{ marginLeft: 8, marginBottom: 0 }}
          />
        )}
      </span>
    ),
  },
  {
    title: 'Team',
    field: 'team',
    width: '18%',
    cellStyle: ellipsis,
    customSort: byText(row => row.team ?? ''),
    render: row =>
      row.team ?? (
        <Typography variant="inherit" color="textSecondary">
          unassigned
        </Typography>
      ),
  },
  {
    title: 'Lifecycle',
    field: 'lifecycle',
    width: '10%',
    cellStyle: oneLine,
    customSort: byText(lifecycleOf),
    render: lifecycleOf,
  },
  {
    title: 'Set-up',
    field: 'setup',
    width: '15%',
    cellStyle: oneLine,
    customSort: byNumber(row => SETUP_ORDER[setupState(row)]),
    render: row => (
      <StatusLabel
        label={setupState(row)}
        intent={SETUP_INTENT[setupState(row)]}
        title={row.setup.error}
      />
    ),
  },
  {
    title: 'Findings',
    field: 'findings',
    type: 'numeric',
    width: '9%',
    customSort: byNumber(row => row.findings?.length ?? 0),
    render: row => (
      <span title={row.findings?.join('\n')}>{row.findings?.length ?? 0}</span>
    ),
  },
  {
    title: 'Last person commit',
    field: 'lastPersonCommit',
    width: '18%',
    cellStyle: oneLine,
    // ISO timestamps order as strings; a repository without one sorts first.
    customSort: byText(row => row.lastPersonCommit ?? ''),
    render: row =>
      row.lastPersonCommit ? (
        <DateComponent value={row.lastPersonCommit} relative />
      ) : (
        <NotAvailable />
      ),
  },
];

/**
 * The inventory rows, sortable by every column (Repository ascending to
 * begin with, the manager's own order), each expandable to the full record
 * -- the Table of `@backstage/core-components` with its detail panel, as the
 * cluster tables use it.
 */
export function RepositoriesTable({
  rows,
  isLoading,
}: {
  rows: RepositoryRow[];
  isLoading: boolean;
}) {
  // The table annotates the rows it is given (keep the query cache's own) and
  // carries a row's state -- its open detail panel -- across re-reads by id.
  const data = useMemo(
    () => rows.map(row => ({ ...row, id: row.repository })),
    [rows],
  );
  return (
    <Table<TableRow>
      isLoading={isLoading}
      options={{
        paging: false,
        padding: 'dense',
        search: false,
        draggable: false,
        // Fixed: the columns share the width they are given and a long name
        // is cut with an ellipsis, instead of the table growing past its column.
        tableLayout: 'fixed',
      }}
      data={data}
      style={{ width: '100%' }}
      // The toolbar wraps the title in an h2 already.
      title={
        <Typography variant="h6" component="span">
          Repositories ({rows.length})
        </Typography>
      }
      columns={columns}
      detailPanel={({ rowData }) => (
        <Box px={2} py={1} data-testid={`details-${rowData.repository}`}>
          <RepositoryDetails repository={rowData.repository} />
        </Box>
      )}
      onRowClick={(_event, _row, toggleDetailPanel) => toggleDetailPanel?.()}
      localization={{
        body: {
          emptyDataSourceMessage: isLoading
            ? 'Reading the inventory…'
            : 'No repositories match.',
        },
      }}
    />
  );
}
