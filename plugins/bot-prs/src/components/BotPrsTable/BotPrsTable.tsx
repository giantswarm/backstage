import { Fragment, useState } from 'react';
import {
  Collapse,
  IconButton,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@material-ui/core';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@material-ui/icons/KeyboardArrowUp';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import { statusIntentOf, type BotPrRow } from '../../lib/marge';
import {
  ageDays,
  formatAge,
  sortRows,
  type SortColumn,
  type SortDirection,
} from '../../lib/rows';
import { BotPrDetails } from '../BotPrDetails';

const COLUMNS: { id: SortColumn; label: string; width?: string }[] = [
  { id: 'team', label: 'Team' },
  { id: 'repository', label: 'Repository' },
  { id: 'title', label: 'Pull request', width: '34%' },
  { id: 'dependency', label: 'Dependency' },
  { id: 'kind', label: 'Bot' },
  { id: 'update', label: 'Update' },
  { id: 'age', label: 'Age' },
  { id: 'classification', label: 'Classification' },
  { id: 'rescue', label: 'Rescue' },
];

/** Short values and every header stay on one line; the title column wraps. */
const NOWRAP = { whiteSpace: 'nowrap' as const };

export type BotPrsTableProps = {
  rows: BotPrRow[];
  /** Several teams in view: the Team column is shown. */
  showTeam: boolean;
  isLive: boolean;
  canAct: boolean;
  onSweep: (row: BotPrRow) => void;
  onMarkBlocked: (row: BotPrRow) => void;
};

/**
 * The queue rows, sortable by every column, each expandable to the engine's
 * full record and the two per-PR actions. Sorted worst first to begin with:
 * the failures, then what waits, then what is fine.
 */
export function BotPrsTable({
  rows,
  showTeam,
  isLive,
  canAct,
  onSweep,
  onMarkBlocked,
}: BotPrsTableProps) {
  const [sort, setSort] = useState<{
    column: SortColumn;
    direction: SortDirection;
  }>({ column: 'classification', direction: 'asc' });
  const [expanded, setExpanded] = useState<string | undefined>();

  const sorted = sortRows(rows, sort.column, sort.direction);
  const columns = showTeam
    ? COLUMNS
    : COLUMNS.filter(column => column.id !== 'team');

  const toggleSort = (column: SortColumn) =>
    setSort(current => ({
      column,
      direction:
        current.column === column && current.direction === 'asc'
          ? 'desc'
          : 'asc',
    }));

  return (
    <Table size="small" aria-label="Bot PRs">
      <TableHead>
        <TableRow>
          <TableCell padding="checkbox" />
          {columns.map(column => (
            <TableCell
              key={column.id}
              style={{ ...NOWRAP, width: column.width }}
              sortDirection={sort.column === column.id ? sort.direction : false}
            >
              <TableSortLabel
                active={sort.column === column.id}
                direction={sort.column === column.id ? sort.direction : 'asc'}
                onClick={() => toggleSort(column.id)}
              >
                {column.label}
              </TableSortLabel>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {sorted.map(row => {
          const open = expanded === row.ref;
          return (
            <Fragment key={row.ref}>
              <TableRow
                hover
                data-testid={`row-${row.ref}`}
                onClick={() => setExpanded(open ? undefined : row.ref)}
                style={{ cursor: 'pointer' }}
              >
                <TableCell padding="checkbox">
                  <IconButton
                    size="small"
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${row.ref}`}
                    aria-expanded={open}
                  >
                    {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                  </IconButton>
                </TableCell>
                {showTeam ? <TableCell>{row.team}</TableCell> : null}
                <TableCell component="th" scope="row">
                  {row.repository.replace(/^giantswarm\//, '')}
                </TableCell>
                <TableCell>
                  <Link
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={event => event.stopPropagation()}
                    title={row.title}
                  >
                    #{row.number}
                  </Link>{' '}
                  {row.title}
                </TableCell>
                <TableCell>{row.dependency}</TableCell>
                <TableCell style={NOWRAP}>{row.kind ?? '—'}</TableCell>
                <TableCell style={NOWRAP}>{row.update_type ?? '—'}</TableCell>
                <TableCell style={NOWRAP}>{formatAge(ageDays(row))}</TableCell>
                <TableCell style={NOWRAP} title={row.detail}>
                  <StatusLabel
                    label={row.status}
                    intent={statusIntentOf(row.group)}
                  />
                </TableCell>
                <TableCell style={NOWRAP} title={row.rescue?.reason}>
                  {row.rescue
                    ? `${row.rescue.outcome}${row.rescue.stale ? ' (stale)' : ''}`
                    : '—'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell
                  style={{ paddingBottom: 0, paddingTop: 0 }}
                  colSpan={columns.length + 1}
                >
                  <Collapse in={open} timeout="auto" unmountOnExit>
                    <div style={{ padding: 16 }}>
                      <BotPrDetails
                        row={row}
                        isLive={isLive}
                        canAct={canAct}
                        onSweep={onSweep}
                        onMarkBlocked={onMarkBlocked}
                      />
                    </div>
                  </Collapse>
                </TableCell>
              </TableRow>
            </Fragment>
          );
        })}
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={columns.length + 1}>
              <Typography variant="body2" color="textSecondary">
                No bot PR matches.
              </Typography>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
