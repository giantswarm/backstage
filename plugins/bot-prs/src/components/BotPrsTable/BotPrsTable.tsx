import { useMemo } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { Box, Link, Typography } from '@material-ui/core';
import { Checkbox } from '@backstage/ui';
import {
  DateComponent,
  NotAvailable,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';

import HelpOutlineIcon from '@material-ui/icons/HelpOutline';

import {
  statusIntentOf,
  versionOf,
  type BotPrRow,
  type MargeGroup,
} from '../../lib/marge';
import { groupRank, nameOf } from '../../lib/rows';
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

/**
 * The tick that keeps a PR in what the buttons act on. The selection is the
 * page's own, keyed by ref: material-table keeps its own on the row objects,
 * which the queue builds again on every read, so a tick would not survive a
 * reload and would not follow the PR.
 */
function selectionColumn(
  rows: BotPrRow[],
  selectedRefs: Set<string>,
  onToggle: (ref: string, isSelected: boolean) => void,
  onToggleAll: (isSelected: boolean) => void,
): TableColumn<BotPrRow> {
  const selected = rows.filter(row => selectedRefs.has(row.ref)).length;
  return {
    title: (
      <Checkbox
        aria-label={
          selected === rows.length ? 'Deselect every PR' : 'Select every PR'
        }
        isSelected={rows.length > 0 && selected === rows.length}
        isIndeterminate={selected > 0 && selected < rows.length}
        onChange={onToggleAll}
      />
    ),
    field: 'id',
    width: '48px',
    sorting: false,
    cellStyle: oneLine,
    render: row => (
      // The row itself opens the record; this click keeps or drops the PR.
      <span
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        role="presentation"
      >
        <Checkbox
          aria-label={`Select ${row.ref}`}
          isSelected={selectedRefs.has(row.ref)}
          onChange={isSelected => onToggle(row.ref, isSelected)}
        />
      </span>
    ),
  };
}

const TEAM_COLUMN: TableColumn<BotPrRow> = {
  title: 'Team',
  field: 'team',
  width: '9%',
  cellStyle: ellipsis,
  customSort: byText(row => row.team),
};

/**
 * The classification cell: the engine's own state, and the way to see the
 * rest of its class. The classes are the engine's closed vocabulary -- no one
 * writes one by hand -- so the only thing to do with one is to narrow the
 * table to it, which is what a click does. A second click on the class in
 * view clears the filter.
 */
function ClassificationCell({
  row,
  filtered,
  onFilter,
}: {
  row: BotPrRow;
  filtered: MargeGroup | undefined;
  onFilter: ((group: MargeGroup | undefined) => void) | undefined;
}) {
  const label = (
    <StatusLabel
      label={row.status}
      intent={statusIntentOf(row.group)}
      // The neutral default is a radio button, which reads as a control the
      // reader may tick. A class nobody has decided is a question, not a
      // choice.
      icon={row.group === 'unclassified' ? HelpOutlineIcon : undefined}
      title={row.detail}
    />
  );
  if (!onFilter) {
    return label;
  }
  const isFiltered = filtered === row.group;
  return (
    <button
      type="button"
      title={`${
        isFiltered
          ? 'Show every classification again'
          : `Show the ${row.status} PRs alone`
      }${row.detail ? `. ${row.detail}` : ''}`}
      onClick={event => {
        // The row itself opens the record; this click narrows the table.
        event.stopPropagation();
        onFilter(isFiltered ? undefined : row.group);
      }}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
        textDecoration: isFiltered ? 'underline' : undefined,
      }}
    >
      {label}
    </button>
  );
}

/**
 * A column nothing in view fills is dropped rather than shown as a column of
 * blanks. The update type and the prior rescue each need the PR itself, which
 * the stored read does not do, so both are empty until something reads the
 * PRs -- a sweep, or a preview.
 */
function withValues(
  columns: (TableColumn<BotPrRow> & { fills?: (row: BotPrRow) => boolean })[],
  rows: BotPrRow[],
): TableColumn<BotPrRow>[] {
  return columns
    .filter(column => !column.fills || rows.some(column.fills))
    .map(({ fills, ...column }) => column);
}

function columnsOf(
  filtered: MargeGroup | undefined,
  onFilter: ((group: MargeGroup | undefined) => void) | undefined,
): (TableColumn<BotPrRow> & { fills?: (row: BotPrRow) => boolean })[] {
  return [
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
      fills: row => Boolean(versionOf(row)),
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
      fills: row => Boolean(row.update_type),
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
        <ClassificationCell row={row} filtered={filtered} onFilter={onFilter} />
      ),
    },
    {
      title: 'Rescue',
      field: 'rescue',
      width: '6%',
      cellStyle: oneLine,
      fills: row => Boolean(row.rescue),
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
}

export type BotPrsTableProps = {
  rows: BotPrRow[];
  /** Several teams in view: the Team column is shown. */
  showTeam: boolean;
  isLoading: boolean;
  canAct: boolean;
  /** The classification the table is narrowed to, when it is. */
  classification?: MargeGroup;
  /** Narrow the table to one classification, or show every one again. */
  onClassification?: (group: MargeGroup | undefined) => void;
  onSweep: (row: BotPrRow) => void;
  onMarkBlocked: (row: BotPrRow) => void;
  /** The PRs the buttons act on; every row of the view to begin with. */
  selectedRefs: Set<string>;
  onToggle: (ref: string, isSelected: boolean) => void;
  onToggleAll: (isSelected: boolean) => void;
};

/**
 * The queue rows, sortable by every column, each expandable to the engine's
 * full record and the per-PR actions -- the Table of
 * `@backstage/core-components` with its detail panel, as the Repositories and
 * cluster tables use it. Sorted worst first to begin with: what failed, then
 * what waits, then what the engine would merge. The leading tick is what the
 * page's buttons act on.
 */
export function BotPrsTable({
  rows,
  showTeam,
  isLoading,
  canAct,
  classification,
  onClassification,
  onSweep,
  onMarkBlocked,
  selectedRefs,
  onToggle,
  onToggleAll,
}: BotPrsTableProps) {
  const columns = useMemo(() => {
    const listed = withValues(
      columnsOf(classification, onClassification),
      rows,
    );
    return [
      selectionColumn(rows, selectedRefs, onToggle, onToggleAll),
      ...(showTeam ? [TEAM_COLUMN] : []),
      ...listed,
    ];
  }, [
    showTeam,
    classification,
    onClassification,
    rows,
    selectedRefs,
    onToggle,
    onToggleAll,
  ]);
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
          Bot PRs ({rows.length}
          {selectedRefs.size < rows.length
            ? `, ${rows.filter(row => selectedRefs.has(row.ref)).length} selected`
            : ''}
          )
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
