import { useMemo } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { Box, Link, Typography } from '@material-ui/core';
import {
  DateComponent,
  NotAvailable,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';

import { statusIntentOf, versionOf, type BotPrRow } from '../../lib/marge';
import { groupRank } from '../../lib/rows';
import { BotPrDetails } from '../BotPrDetails';

const byRef = (a: BotPrRow, b: BotPrRow) => a.ref.localeCompare(b.ref, 'en');

const byText =
  (read: (row: BotPrRow) => string) => (a: BotPrRow, b: BotPrRow) =>
    read(a).localeCompare(read(b), 'en') || byRef(a, b);

/** A cell whose words stay on one line. */
const oneLine = { whiteSpace: 'nowrap' as const };

/** One line, cut with an ellipsis when the column is narrower (the full text is the title). */
const ellipsis = {
  ...oneLine,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
};

/** The repository without its org: nearly every row of the queue shares it. */
const nameOf = (row: BotPrRow) => row.repository.replace(/^[^/]+\//, '');

const TEAM_COLUMN: TableColumn<BotPrRow> = {
  title: 'Team',
  field: 'team',
  width: '9%',
  cellStyle: ellipsis,
  customSort: byText(row => row.team),
};

const COLUMNS: TableColumn<BotPrRow>[] = [
  {
    title: 'Repository',
    field: 'repository',
    width: '15%',
    cellStyle: ellipsis,
    customSort: byText(nameOf),
    render: row => <span title={row.repository}>{nameOf(row)}</span>,
  },
  {
    title: 'Pull request',
    field: 'title',
    highlight: true,
    width: '25%',
    cellStyle: ellipsis,
    customSort: byText(row => row.title.toLowerCase()),
    render: row => (
      <span title={row.title}>
        <Link
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={event => event.stopPropagation()}
        >
          #{row.number}
        </Link>{' '}
        {row.title}
      </span>
    ),
  },
  {
    title: 'Dependency',
    field: 'dependency',
    width: '13%',
    cellStyle: ellipsis,
    customSort: byText(row => row.dependency.toLowerCase()),
    render: row => <span title={row.dependency}>{row.dependency}</span>,
  },
  {
    title: 'Version',
    field: 'versionTo',
    width: '11%',
    cellStyle: ellipsis,
    customSort: byText(row => versionOf(row)),
    render: row => {
      const version = versionOf(row);
      return version ? (
        <span title={version}>{version}</span>
      ) : (
        <NotAvailable />
      );
    },
  },
  {
    title: 'Bot',
    field: 'kind',
    width: '7%',
    cellStyle: oneLine,
    // The bot is the first thing a reader separates: a Renovate bump and an
    // Align files PR are not read the same way. Under it the rows stay in
    // the classification order the page sorts by.
    customSort: (a: BotPrRow, b: BotPrRow) =>
      (a.kind ?? '').localeCompare(b.kind ?? '', 'en') ||
      groupRank(a) - groupRank(b) ||
      byRef(a, b),
    render: row => row.kind ?? <NotAvailable />,
  },
  {
    title: 'Update',
    field: 'update_type',
    width: '7%',
    cellStyle: oneLine,
    customSort: byText(row => row.update_type ?? ''),
    render: row => row.update_type ?? <NotAvailable />,
  },
  {
    title: 'Opened',
    field: 'created_at',
    width: '11%',
    cellStyle: oneLine,
    // ISO timestamps order as strings; a PR without one sorts first.
    customSort: byText(row => row.created_at ?? ''),
    render: row =>
      row.created_at ? (
        <DateComponent value={row.created_at} relative />
      ) : (
        <NotAvailable />
      ),
  },
  {
    title: 'Classification',
    field: 'status',
    width: '12%',
    cellStyle: oneLine,
    defaultSort: 'asc',
    // Worst first, and inside one class the bots stay apart.
    customSort: (a: BotPrRow, b: BotPrRow) =>
      groupRank(a) - groupRank(b) ||
      (a.kind ?? '').localeCompare(b.kind ?? '', 'en') ||
      byRef(a, b),
    render: row => (
      <StatusLabel
        label={row.status}
        intent={statusIntentOf(row.group)}
        title={row.detail}
      />
    ),
  },
  {
    title: 'Rescue',
    field: 'rescue',
    width: '6%',
    cellStyle: oneLine,
    customSort: byText(row =>
      row.rescue ? `${row.rescue.outcome} ${row.rescue.at ?? ''}` : '',
    ),
    render: row =>
      row.rescue ? (
        <span title={row.rescue.reason}>
          {row.rescue.outcome}
          {row.rescue.stale ? ' (stale)' : ''}
        </span>
      ) : (
        <NotAvailable />
      ),
  },
];

export type BotPrsTableProps = {
  rows: BotPrRow[];
  /** Several teams in view: the Team column is shown. */
  showTeam: boolean;
  isLoading: boolean;
  canAct: boolean;
  onSweep: (row: BotPrRow) => void;
  onMarkBlocked: (row: BotPrRow) => void;
};

/**
 * The queue rows, sortable by every column, each expandable to the engine's
 * full record and the per-PR actions -- the Table of
 * `@backstage/core-components` with its detail panel, as the Repositories and
 * cluster tables use it. Sorted worst first to begin with: what failed, then
 * what waits, then what the engine would merge.
 */
export function BotPrsTable({
  rows,
  showTeam,
  isLoading,
  canAct,
  onSweep,
  onMarkBlocked,
}: BotPrsTableProps) {
  const columns = useMemo(
    () => (showTeam ? [TEAM_COLUMN, ...COLUMNS] : COLUMNS),
    [showTeam],
  );
  return (
    <Table<BotPrRow>
      isLoading={isLoading}
      options={{
        paging: false,
        padding: 'dense',
        search: false,
        draggable: false,
        // Fixed: the columns share the width they are given and a long title
        // is cut with an ellipsis, instead of the table growing past its column.
        tableLayout: 'fixed',
      }}
      data={rows}
      style={{ width: '100%' }}
      // The toolbar wraps the title in an h2 already.
      title={
        <Typography variant="h6" component="span">
          Bot PRs ({rows.length})
        </Typography>
      }
      columns={columns}
      detailPanel={({ rowData }) => (
        <Box px={2} py={1} data-testid={`details-${rowData.ref}`}>
          <BotPrDetails
            row={rowData}
            canAct={canAct}
            onSweep={onSweep}
            onMarkBlocked={onMarkBlocked}
          />
        </Box>
      )}
      onRowClick={(_event, _row, toggleDetailPanel) => toggleDetailPanel?.()}
      localization={{
        body: {
          emptyDataSourceMessage: isLoading
            ? 'Reading the queue…'
            : 'No bot PR matches.',
        },
      }}
    />
  );
}
