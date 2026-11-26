import { useCallback, useMemo } from 'react';
import {
  Cell,
  Checkbox,
  Flex,
  Link,
  Table,
  TagGroup,
  Tag,
  Text,
  useTable,
  type ColumnConfig,
  type SortDescriptor,
  VisuallyHidden,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  ExternalLink,
  StackedRowList,
  useFittingColumns,
  type FittingTier,
} from '@giantswarm/backstage-plugin-ui-react';

import type { PrRow, PrState } from '../../lib/github';
import type { PrStateEntry } from '../../hooks/usePrStates';
import { teamLabelOf } from '../../lib/github';
import { shortAge } from '../../lib/format';
import {
  ciShown,
  mergeShown,
  PrStateLabel,
  reviewShown,
} from '../PrStateCells';

type TableRow = PrRow & {
  requested: string[];
  state: PrStateEntry | undefined;
};

/** Oldest first: the order a section opens in. */
export const DEFAULT_PR_SORT: SortDescriptor = {
  column: 'created',
  direction: 'ascending',
};

// Each column's header with its sort arrow and padding, and its usual value.
const MIN_WIDTHS = {
  title: 240,
  requested: 135,
  created: 100,
  updated: 100,
  ci: 130,
  review: 140,
  merge: 125,
};

const useStyles = makeStyles({
  // A stacked row's title: the link itself is the two-line box, so a long
  // title ends in an ellipsis inside it instead of being clipped by the row,
  // and the whole title is on hover.
  stackedTitle: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    overflowWrap: 'anywhere',
  },
});

// With ticks, the table's checkbox column takes about 48px more, counted
// with the title so the layout steps down before a column is squeezed.
const SELECTABLE_MIN_WIDTHS = { ...MIN_WIDTHS, title: MIN_WIDTHS.title + 48 };

// Left out first when the columns don't fit; the title cell then says them.
const DROP_FIRST = ['requested', 'updated'];

// The worst first when a state column sorts ascending.
const CI_RANK = { failing: 0, running: 1, none: 2, passing: 3 } as const;
const REVIEW_RANK = { changes_requested: 0, none: 1, approved: 2 } as const;
const MERGE_RANK = {
  conflicts: 0,
  blocked: 1,
  behind: 2,
  checking: 3,
  draft: 4,
  ready: 5,
} as const;

function stateRank(row: TableRow, column: string): number {
  const state: PrState | undefined = row.state?.state;
  if (!state) {
    return Number.MAX_SAFE_INTEGER;
  }
  switch (column) {
    case 'ci':
      return CI_RANK[state.ci.state];
    case 'review':
      return REVIEW_RANK[state.review.state];
    default:
      return MERGE_RANK[state.merge.state];
  }
}

export function sortPrRows(rows: TableRow[], sort: SortDescriptor): TableRow[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;
  const compare = (a: TableRow, b: TableRow): number => {
    switch (column) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'requested':
        return a.requested.join().localeCompare(b.requested.join());
      case 'updated':
        return a.updatedAt.localeCompare(b.updatedAt);
      case 'ci':
      case 'review':
      case 'merge':
        return stateRank(a, column) - stateRank(b, column);
      default:
        return a.createdAt.localeCompare(b.createdAt);
    }
  };
  return [...rows].sort(
    (a, b) => factor * compare(a, b) || a.id.localeCompare(b.id),
  );
}

function requestedLabel(requested: string[]): string {
  return requested.length > 0
    ? requested
        .map(tag => (tag === 'you' ? 'you' : teamLabelOf(tag)))
        .join(', ')
    : 'a team';
}

function Age({ iso, prefix = '' }: { iso: string; prefix?: string }) {
  return (
    <span
      title={new Date(iso).toLocaleString()}
      style={{ whiteSpace: 'nowrap' }}
    >
      {prefix}
      {shortAge(iso)}
    </span>
  );
}

function TitleCell({
  row,
  folded,
  showRequested,
}: {
  row: TableRow;
  folded: boolean;
  showRequested: boolean;
}) {
  const tags = [...(row.draft ? ['draft'] : []), ...row.labels];
  return (
    <Cell>
      <Flex direction="column" gap="1">
        <ExternalLink href={row.url} display="inline" title={row.title}>
          {row.title}
        </ExternalLink>
        <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
          <Text
            variant="body-small"
            color="secondary"
            style={{ overflowWrap: 'anywhere' }}
          >
            {row.repo}#{row.number} · {row.author}
            {folded && showRequested && ` · ${requestedLabel(row.requested)}`}
            {folded && (
              <>
                {' · '}
                <Age iso={row.updatedAt} prefix="updated " />
              </>
            )}
          </Text>
          {tags.length > 0 && (
            <TagGroup aria-label="Labels">
              {tags.map(label => (
                <Tag key={label} id={label} size="small">
                  {label}
                </Tag>
              ))}
            </TagGroup>
          )}
        </Flex>
      </Flex>
    </Cell>
  );
}

function stateColumns(): ColumnConfig<TableRow>[] {
  return [
    {
      id: 'ci',
      label: 'CI',
      isSortable: true,
      cell: row => (
        <Cell>
          <PrStateLabel
            entry={row.state}
            shownOf={state => ciShown(state.ci)}
          />
        </Cell>
      ),
    },
    {
      id: 'review',
      label: 'Review',
      isSortable: true,
      cell: row => (
        <Cell>
          <PrStateLabel
            entry={row.state}
            shownOf={state => reviewShown(state.review)}
          />
        </Cell>
      ),
    },
    {
      id: 'merge',
      label: 'Merge',
      isSortable: true,
      cell: row => (
        <Cell>
          <PrStateLabel
            entry={row.state}
            shownOf={state => mergeShown(state.merge)}
          />
        </Cell>
      ),
    },
  ];
}

export type PrTableProps = {
  rows: PrRow[];
  /** Who each request names, by PR id; given for "Waiting on me" only. */
  requestedOf?: Map<string, string[]>;
  /** Each PR's state, by PR id; without it the state columns are left out. */
  states?: Map<string, PrStateEntry>;
  sort: SortDescriptor;
  onSortChange: (sort: SortDescriptor) => void;
  /** The ticked PR ids, for a section whose rows can be ticked. */
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (selected: Set<string>) => void;
  };
};

/**
 * One section's PRs. A click on a row opens the PR on GitHub in a new tab:
 * the tab is a queue, not a review UI. Where the columns don't fit, Requested
 * and Updated move into the title cell, then the rows stack.
 */
export function PrTable({
  rows,
  requestedOf,
  states,
  sort,
  onSortChange,
  selection,
}: PrTableProps) {
  const classes = useStyles();
  const showRequested = Boolean(requestedOf);
  const showState = Boolean(states);
  const data = useMemo(
    () =>
      rows.map(row => ({
        ...row,
        requested: requestedOf?.get(row.id) ?? [],
        state: states?.get(row.id),
      })),
    [rows, requestedOf, states],
  );

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<TableRow>[] => {
      const folded = tier !== 'full';
      const columns: ColumnConfig<TableRow>[] = [
        {
          id: 'title',
          label: 'Pull request',
          isRowHeader: true,
          isSortable: true,
          cell: row => (
            <TitleCell
              row={row}
              folded={folded}
              showRequested={showRequested}
            />
          ),
        },
      ];
      if (showRequested) {
        columns.push({
          id: 'requested',
          label: 'Requested',
          isSortable: true,
          cell: row => (
            <Cell>
              <Text variant="body-small">{requestedLabel(row.requested)}</Text>
            </Cell>
          ),
        });
      }
      columns.push(
        {
          id: 'created',
          label: 'Opened',
          isSortable: true,
          cell: row => (
            <Cell>
              <Text variant="body-small">
                <Age iso={row.createdAt} />
              </Text>
            </Cell>
          ),
        },
        {
          id: 'updated',
          label: 'Updated',
          isSortable: true,
          cell: row => (
            <Cell>
              <Text variant="body-small">
                <Age iso={row.updatedAt} />
              </Text>
            </Cell>
          ),
        },
      );
      return showState ? [...columns, ...stateColumns()] : columns;
    },
    [showRequested, showState],
  );

  const fit = useFittingColumns(columnsFor, {
    minWidths: selection ? SELECTABLE_MIN_WIDTHS : MIN_WIDTHS,
    dropFirst: DROP_FIRST,
  });
  const shown = fit.columns.filter(column => !column.isHidden);
  // A sort on a column the layout does not show falls back to the default.
  const shownSort = shown.some(column => column.id === sort.column)
    ? sort
    : DEFAULT_PR_SORT;
  const { tableProps } = useTable<TableRow>({
    mode: 'complete',
    data,
    sortFn: sortPrRows,
    sort: shownSort,
    onSortChange,
    paginationOptions: { type: 'none' },
  });

  return (
    <div ref={fit.ref}>
      {fit.isCompact ? (
        <StackedRowList
          aria-label="Pull requests"
          rows={sortPrRows(data, shownSort).map(row => ({
            id: row.id,
            title: (
              <Link
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                title={row.title}
                className={classes.stackedTitle}
              >
                {row.title}
                <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
              </Link>
            ),
            facts: [
              `${row.repo}#${row.number}`,
              row.author,
              showRequested && requestedLabel(row.requested),
              <Age iso={row.createdAt} prefix="opened " />,
              row.draft && 'draft',
            ],
            actions: selection && (
              <Checkbox
                aria-label={`Tick ${row.repo}#${row.number}`}
                isSelected={selection.selected.has(row.id)}
                onChange={ticked => {
                  const next = new Set(selection.selected);
                  if (ticked) {
                    next.add(row.id);
                  } else {
                    next.delete(row.id);
                  }
                  selection.onChange(next);
                }}
              />
            ),
            details: showState ? (
              <Flex gap="3" style={{ flexWrap: 'wrap' }}>
                <PrStateLabel
                  entry={row.state}
                  shownOf={state => ciShown(state.ci)}
                />
                <PrStateLabel
                  entry={row.state}
                  shownOf={state => reviewShown(state.review)}
                />
                <PrStateLabel
                  entry={row.state}
                  shownOf={state => mergeShown(state.merge)}
                />
              </Flex>
            ) : undefined,
          }))}
        />
      ) : (
        <Table<TableRow>
          {...tableProps}
          columnConfig={fit.columns}
          rowConfig={{
            onClick: row => window.open(row.url, '_blank', 'noopener'),
          }}
          selection={
            selection && {
              mode: 'multiple',
              behavior: 'toggle',
              selected: new Set(selection.selected),
              onSelectionChange: keys =>
                selection.onChange(
                  keys === 'all'
                    ? new Set(data.map(row => row.id))
                    : new Set([...keys].map(String)),
                ),
            }
          }
        />
      )}
    </div>
  );
}
