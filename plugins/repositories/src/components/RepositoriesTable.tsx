import { Fragment, useState } from 'react';
import {
  Chip,
  Collapse,
  IconButton,
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
import { RepositoryRow } from '../apis';
import {
  lifecycleOf,
  setupState,
  SortColumn,
  SortDirection,
  sortRows,
} from '../lib/rows';
import { RepositoryDetails } from './RepositoryDetails';

const COLUMNS: { id: SortColumn; label: string; numeric?: boolean }[] = [
  { id: 'repository', label: 'Repository' },
  { id: 'team', label: 'Team' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'lastPersonCommit', label: 'Last person commit' },
  { id: 'score', label: 'Score', numeric: true },
  { id: 'setup', label: 'Set-up' },
  { id: 'findings', label: 'Findings', numeric: true },
  { id: 'age', label: 'Age' },
];

/**
 * The inventory rows, sortable by every column, each expandable to the full
 * record. The manager lists by orphan score; the initial order keeps that.
 */
export function RepositoriesTable({ rows }: { rows: RepositoryRow[] }) {
  const [sort, setSort] = useState<{
    column: SortColumn;
    direction: SortDirection;
  }>({
    column: 'score',
    direction: 'desc',
  });
  const [expanded, setExpanded] = useState<string | undefined>();

  const sorted = sortRows(rows, sort.column, sort.direction);

  const toggleSort = (column: SortColumn) =>
    setSort(current => ({
      column,
      direction:
        current.column === column && current.direction === 'asc'
          ? 'desc'
          : 'asc',
    }));

  return (
    <Table size="small" aria-label="Repositories">
      <TableHead>
        <TableRow>
          <TableCell padding="checkbox" />
          {COLUMNS.map(column => (
            <TableCell
              key={column.id}
              align={column.numeric ? 'right' : 'left'}
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
          const open = expanded === row.repository;
          const name = row.repository.replace(/^[^/]+\//, '');
          return (
            <Fragment key={row.repository}>
              <TableRow
                hover
                data-testid={`row-${name}`}
                onClick={() => setExpanded(open ? undefined : row.repository)}
                style={{ cursor: 'pointer' }}
              >
                <TableCell padding="checkbox">
                  <IconButton
                    size="small"
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${row.repository}`}
                    aria-expanded={open}
                  >
                    {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                  </IconButton>
                </TableCell>
                <TableCell component="th" scope="row">
                  {row.repository}
                  {row.gone && (
                    <Chip size="small" label="gone" style={{ marginLeft: 4 }} />
                  )}
                  {row.decision && (
                    <Chip
                      size="small"
                      label={row.decision}
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </TableCell>
                <TableCell>{row.team ?? <em>unassigned</em>}</TableCell>
                <TableCell>{lifecycleOf(row)}</TableCell>
                <TableCell>
                  {row.lastPersonCommit?.slice(0, 10) ?? '—'}
                </TableCell>
                <TableCell align="right" title={row.orphan.reasons.join('\n')}>
                  {row.orphan.score}
                </TableCell>
                <TableCell title={row.setup.error}>{setupState(row)}</TableCell>
                <TableCell align="right" title={row.findings?.join('\n')}>
                  {row.findings?.length ?? 0}
                </TableCell>
                <TableCell>{row.age}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell
                  style={{ paddingBottom: 0, paddingTop: 0 }}
                  colSpan={COLUMNS.length + 1}
                >
                  <Collapse in={open} timeout="auto" unmountOnExit>
                    <div style={{ padding: 16 }}>
                      <RepositoryDetails repository={row.repository} />
                    </div>
                  </Collapse>
                </TableCell>
              </TableRow>
            </Fragment>
          );
        })}
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMNS.length + 1}>
              <Typography variant="body2" color="textSecondary">
                No repositories match.
              </Typography>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
