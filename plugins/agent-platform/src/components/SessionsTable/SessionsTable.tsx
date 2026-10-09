import { useCallback, useEffect, useMemo, useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import {
  Badge,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  SearchField,
  Select,
  Skeleton,
  Table,
  Text,
  ToggleButton,
  ToggleButtonGroup,
  useTable,
} from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useTheme } from '@material-ui/core';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useNavigate } from 'react-router-dom';
import {
  DateComponent,
  stopRowPress,
} from '@giantswarm/backstage-plugin-ui-react';
import { sessionDetailRouteRef } from '../../routes';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import { toneColor } from '../../lib/sessionStateTone';
import {
  SessionRow,
  sessionSearchFn,
  sortSessionsBy,
} from '../SessionsDataProvider/helpers';
import {
  SessionTableRow,
  sortSessionsByState,
  STATE_IDLE_LABEL,
  STATE_UNKNOWN_LABEL,
  withSessionStates,
} from './helpers';
import {
  countSessionsByState,
  filterSessions,
  isSessionsFilterActive,
  NO_SESSIONS_FILTER,
  SESSION_STATE_FILTERS,
  SessionsFilter,
  SessionStateFilter,
  sessionAgentOptions,
} from './filters';
import {
  RUNTIME_LOST_LABEL,
  RUNTIME_LOST_TITLE,
  SessionAgent,
  TRUNCATE,
  Unknown,
} from './cells';
import { ShellSessionsTable } from './ShellSessionsTable';
import { STABLE_CLASS_NAMES } from '../../lib/stableClassNames';

export { RUNTIME_LOST_LABEL, RUNTIME_LOST_TITLE };

/** Copy for each way a state can be missing, kept in one place. */
const STATE_UNKNOWN_TITLE =
  'kagent could not be read for this session, so its state is not known. This is not the same as finished.';
const STATE_IDLE_TITLE =
  'This session was started and has no turn that reported a state.';
const STATE_UNEVALUATED_LABEL = 'Not loaded';
const STATE_UNEVALUATED_TITLE = 'Open the session to see its state.';

/**
 * The State column's cell: the state of the session's newest turn.
 *
 * A dot *and* the state's words, never the dot alone — the colour repeats what
 * the label says rather than carrying it. The wording and the tone come from
 * `describeSessionState`, the same map the session page's badge and the rail's
 * groups read, so one session cannot be called two things on two screens.
 */
function StateCell({
  row,
  isLoading,
}: {
  row: SessionTableRow;
  isLoading: boolean;
}) {
  const theme = useTheme();
  const cell = row.stateCell;

  if (cell.kind === 'unevaluated') {
    // Nothing has come back yet: a placeholder, not a claim about the session.
    if (isLoading) {
      return (
        <Cell>
          <Skeleton height="16px" />
        </Cell>
      );
    }
    return (
      <Cell>
        <Text
          variant="body-medium"
          color="secondary"
          title={STATE_UNEVALUATED_TITLE}
        >
          {STATE_UNEVALUATED_LABEL}
        </Text>
      </Cell>
    );
  }

  if (cell.kind === 'unreadable') {
    return (
      <Cell>
        <Text
          variant="body-medium"
          color="secondary"
          title={STATE_UNKNOWN_TITLE}
        >
          {STATE_UNKNOWN_LABEL}
        </Text>
      </Cell>
    );
  }

  if (cell.kind === 'idle') {
    return (
      <Cell>
        <Text variant="body-medium" color="secondary" title={STATE_IDLE_TITLE}>
          {STATE_IDLE_LABEL}
        </Text>
      </Cell>
    );
  }

  return (
    <Cell>
      <Flex align="center" gap="2">
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            // An app stylesheet may recolour a tone through the variable.
            backgroundColor: `var(--agent-platform-state-dot-${
              cell.state.tone
            }, ${toneColor(cell.state.tone, theme)})`,
          }}
        />
        <Text variant="body-medium" truncate style={{ minWidth: 0 }}>
          {cell.state.label}
        </Text>
      </Flex>
    </Cell>
  );
}

function getColumnConfig(
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>,
  hrefFor: (row: SessionRow) => string | undefined,
  isLoadingStates: boolean,
): ColumnConfig<SessionTableRow>[] {
  return [
    {
      id: 'title',
      label: 'Session',
      isRowHeader: true,
      isSortable: true,
      // One line, cut to the column: the title is what a row is found by, so
      // it takes the room the short columns give up.
      defaultWidth: '3fr',
      minWidth: 200,
      cell: row => {
        const href = hrefFor(row);
        // A real anchor in the row-header cell, *as well as* the whole-row
        // onClick below. The anchor is what makes cmd/middle-click open a new tab
        // and what gives keyboard users something focusable; the row click is the
        // convenience affordance. `Link` from core-components routes client-side,
        // which `rowConfig.getHref` would not: BUIProvider is not mounted in this
        // app, so react-aria's RouterProvider is inactive and a bui `href` would
        // trigger a full page reload.
        //
        // The two affordances must not both fire for one click — see
        // {@link stopRowPress}.
        return (
          <Cell>
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              {href ? (
                <Link
                  to={href}
                  title={row.title}
                  style={TRUNCATE}
                  onPointerDown={stopRowPress}
                  onPointerUp={stopRowPress}
                  onClick={stopRowPress}
                >
                  {row.title}
                </Link>
              ) : (
                <Text
                  variant="body-medium"
                  truncate
                  title={row.title}
                  style={{ minWidth: 0 }}
                >
                  {row.title}
                </Text>
              )}
              {/* Said in the list, before the person opens it and types: a
                  session kagent reports lost takes no message any more. The
                  page explains and offers the way on. */}
              {row.runtimeLost && (
                <Badge
                  size="small"
                  title={RUNTIME_LOST_TITLE}
                  style={{ flexShrink: 0 }}
                >
                  {RUNTIME_LOST_LABEL}
                </Badge>
              )}
            </Flex>
          </Cell>
        );
      },
    },
    {
      id: 'agentName',
      label: 'Agent',
      isSortable: true,
      defaultWidth: '1.5fr',
      minWidth: 160,
      cell: row => (
        <Cell>
          <SessionAgent row={row} buildAvatarUrl={buildAvatarUrl} />
        </Cell>
      ),
    },
    {
      // Between the agent and the installation: what the session is doing reads
      // with what it is, before where it runs.
      id: 'state',
      label: 'State',
      isSortable: true,
      // Sized for the longest label, "Waiting for input".
      defaultWidth: '1fr',
      minWidth: 150,
      cell: row => <StateCell row={row} isLoading={isLoadingStates} />,
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      defaultWidth: '0.75fr',
      minWidth: 110,
      cell: row => <CellText title={row.installation} />,
    },
    // No "Last activity": kagent API v2 never moves an instance's `updated_at`
    // after it is ready, so it only repeated Started. kagent-dev/kagent#2397.
    {
      id: 'createdAt',
      label: 'Started',
      isSortable: true,
      defaultWidth: '1fr',
      minWidth: 130,
      cell: row => (
        <Cell>
          {row.createdAt ? (
            <DateComponent value={row.createdAt} relative />
          ) : (
            <Unknown />
          )}
        </Cell>
      ),
    },
  ];
}

const ALL_AGENTS = '';

/**
 * The State chips, each with how many of the rows the search matched it would
 * show, and the agent picker over every loaded row. A fleet still loading
 * counts what has arrived.
 */
function SessionsFilterBar({
  rows,
  searchedRows,
  isLoading,
  filter,
  onChange,
  showStates,
  showAgents,
}: {
  rows: SessionTableRow[];
  searchedRows: SessionTableRow[];
  isLoading: boolean;
  filter: SessionsFilter;
  onChange: (filter: SessionsFilter) => void;
  showStates: boolean;
  showAgents: boolean;
}) {
  const counts = useMemo(
    () => countSessionsByState(searchedRows, filter.agent),
    [searchedRows, filter.agent],
  );
  const agentOptions = useMemo(() => sessionAgentOptions(rows), [rows]);

  // A picked agent whose sessions are gone (deleted, or another installation
  // scope) would leave the list empty behind a picker that no longer offers it.
  const pickedAgentGone =
    !isLoading &&
    filter.agent !== undefined &&
    !agentOptions.some(option => option.id === filter.agent);
  useEffect(() => {
    if (pickedAgentGone) {
      onChange({ ...filter, agent: undefined });
    }
  }, [pickedAgentGone, filter, onChange]);

  return (
    <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
      {showStates && (
        <ToggleButtonGroup
          className={STABLE_CLASS_NAMES.stateFilter}
          aria-label="Filter by state"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[filter.state]}
          onSelectionChange={keys => {
            const next = [...keys][0];
            if (SESSION_STATE_FILTERS.some(({ id }) => id === next)) {
              onChange({ ...filter, state: next as SessionStateFilter });
            }
          }}
        >
          {SESSION_STATE_FILTERS.map(({ id, label }) => (
            <ToggleButton key={id} id={id} size="small">
              {`${label} ${counts[id]}`}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
      {showAgents && (
        <Select
          aria-label="Filter by agent"
          size="small"
          options={[{ id: ALL_AGENTS, label: 'All agents' }, ...agentOptions]}
          selectedKey={filter.agent ?? ALL_AGENTS}
          onSelectionChange={key => {
            const agent = key === null ? ALL_AGENTS : String(key);
            onChange({
              ...filter,
              agent: agent === ALL_AGENTS ? undefined : agent,
            });
          }}
          style={{ minWidth: 200 }}
        />
      )}
    </Flex>
  );
}

function emptyText(
  searchTerm: string,
  filtered: boolean,
  emptyMessage: string,
): string {
  if (searchTerm) {
    return filtered
      ? `No sessions match "${searchTerm}" and the filters.`
      : `No sessions match "${searchTerm}".`;
  }
  return filtered ? 'No sessions match the filters.' : emptyMessage;
}

/** Columns an embedding page may drop because its context already implies them. */
export type HideableSessionColumn = 'agentName' | 'installation';

export type SessionsTableProps = {
  rows: SessionRow[];
  /**
   * Derived state per session, from `useFleetSessionStates`. The State column is
   * rendered only when this is given: a table with no states to show is better
   * without the column than with one full of dashes.
   */
  sessionStates?: FleetSessionStatesView;
  /** True only while no rows exist yet, so the skeleton replaces the table. */
  isLoading?: boolean;
  /** Search debounce; set to 0 in tests so typing takes effect immediately. */
  searchDebounceMs?: number;
  /**
   * Columns to leave out. For an agent's own sessions the agent and installation
   * are fixed by the surrounding page, so repeating them in every row is noise.
   */
  hideColumns?: ReadonlyArray<HideableSessionColumn>;
  /**
   * Whether to render the search field. Off for a short embedded list, where
   * there is nothing to search through and the field competes with the page's
   * own controls.
   */
  showSearch?: boolean;
  /** Whether to paginate. Off for a short embedded list. */
  showPagination?: boolean;
  /** Replaces the default "No sessions found." message. */
  emptyMessage?: string;
  /**
   * Whether to render the State chips (when states are given) and the agent
   * picker (when the Agent column shows).
   */
  showFilters?: boolean;
  /**
   * `shell` is the agent-platform shell's list: rows grouped by the day they
   * started, the shell's state words, and a row menu. It always shows its
   * search and filters, and does not paginate or sort.
   */
  layout?: 'classic' | 'shell';
};

/**
 * Presentational table of sessions, with client-side search and filtering.
 *
 * The page owns the loading indicator for incremental fleet loading and the
 * per-installation notices; this renders rows, the search field, and the empty
 * state.
 */
export function SessionsTable({ layout, ...props }: SessionsTableProps) {
  return layout === 'shell' ? (
    <ShellSessionsTable {...props} />
  ) : (
    <ClassicSessionsTable {...props} />
  );
}

/**
 * The classic list: one paginated table with sortable columns.
 *
 * The page owns the loading indicator for incremental fleet loading and the
 * per-installation notices; this renders rows, the search field, and the empty
 * state.
 */
function ClassicSessionsTable({
  rows,
  sessionStates,
  isLoading,
  searchDebounceMs = 150,
  hideColumns,
  showSearch = true,
  showPagination = true,
  emptyMessage = 'No sessions found.',
  showFilters = false,
}: SessionsTableProps) {
  const buildAvatarUrl = useAgentAvatarUrl();
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);

  // Both parameters are needed: kagent session ids are only unique within an
  // installation. Undefined when the route isn't bound, in which case rows render
  // as plain text rather than as links that go nowhere.
  const hrefFor = useCallback(
    (row: SessionRow) =>
      sessionDetailRoute?.({
        installation: row.installation,
        sessionId: row.sessionId,
      }),
    [sessionDetailRoute],
  );

  // The states joined onto the rows here rather than by each caller: search and
  // sorting run over what the table is given, so the join has to happen before
  // `useTable` sees the rows.
  const stateRows = useMemo(
    () => withSessionStates(rows, sessionStates),
    [rows, sessionStates],
  );

  const hiddenKey = hideColumns?.join(',') ?? '';
  const isLoadingStates = sessionStates?.isLoading ?? false;
  const hasStates = sessionStates !== undefined;
  const columnConfig = useMemo(() => {
    const hidden = new Set<string>(hiddenKey ? hiddenKey.split(',') : []);
    if (!hasStates) {
      hidden.add('state');
    }

    return getColumnConfig(buildAvatarUrl, hrefFor, isLoadingStates).filter(
      column => !hidden.has(String(column.id)),
    );
  }, [buildAvatarUrl, hrefFor, hiddenKey, hasStates, isLoadingStates]);

  // Sorting by State is the one column whose order is not a field comparison —
  // see `sortSessionsByState` for why it is a rank and not the label.
  const sortFn = useCallback(
    (
      sorted: SessionTableRow[],
      sort: { column: unknown; direction: 'ascending' | 'descending' },
    ) =>
      String(sort.column) === 'state'
        ? sortSessionsByState(sorted, sort.direction)
        : sortSessionsBy(sorted, sort),
    [],
  );

  // Name only the axes the caller still shows. `sessionSearchFn` matches the
  // agent and the installation whatever is hidden, which is harmless — it finds
  // more than the placeholder promises — but on a list scoped to one agent on
  // one installation, offering them as ways to search is an empty offer.
  const searchPlaceholder = useMemo(() => {
    const hidden = new Set<string>(hiddenKey ? hiddenKey.split(',') : []);
    const axes = [
      'session',
      ...(hidden.has('agentName') ? [] : ['agent']),
      ...(hidden.has('installation') ? [] : ['installation']),
    ];
    const last = axes.pop();
    if (axes.length === 0) {
      return `Search by ${last}`;
    }
    // Two axes read "a or b"; three keep the serial comma of the original copy.
    const rest = axes.length === 1 ? axes[0] : `${axes.join(', ')},`;
    return `Search by ${rest} or ${last}`;
  }, [hiddenKey]);

  const showStateFilter = showFilters && hasStates;
  const showAgentFilter =
    showFilters && !hiddenKey.split(',').includes('agentName');

  const { tableProps, search, filter } = useTable<
    SessionTableRow,
    SessionsFilter
  >({
    mode: 'complete',
    // `undefined` rather than `[]` while loading: an empty array renders the
    // empty state, so the skeleton would never show and "No sessions found."
    // would flash before the first rows arrive.
    data: isLoading ? undefined : stateRows,
    searchFn: sessionSearchFn,
    searchDebounceMs,
    initialFilter: NO_SESSIONS_FILTER,
    filterFn: filterSessions,
    sortFn,
    initialSort: { column: 'createdAt', direction: 'descending' },
    paginationOptions: showPagination
      ? { pageSize: 25, pageSizeOptions: [25, 50, 100] }
      : { type: 'none' },
  });

  // The term the rows are filtered by: `useTable` debounces the search and
  // does not hand the debounced value back, so the empty state and
  // the chip counts keep their own.
  const [searchTerm, setSearchTerm] = useState('');
  useDebounce(() => setSearchTerm(search.value.trim()), searchDebounceMs, [
    search.value,
  ]);
  const searchedRows = useMemo(
    () => sessionSearchFn(stateRows, searchTerm),
    [stateRows, searchTerm],
  );

  const activeFilter = filter.value ?? NO_SESSIONS_FILTER;
  const filtered = isSessionsFilterActive(activeFilter);

  return (
    <Flex direction="column" gap="3">
      {(showStateFilter || showAgentFilter) && (
        <SessionsFilterBar
          rows={stateRows}
          searchedRows={searchedRows}
          isLoading={Boolean(isLoading)}
          filter={activeFilter}
          onChange={filter.onChange}
          showStates={showStateFilter}
          showAgents={showAgentFilter}
        />
      )}
      {showSearch && (
        <SearchField
          aria-label="Search sessions"
          placeholder={searchPlaceholder}
          value={search.value}
          onChange={search.onChange}
        />
      )}
      <Table<SessionTableRow>
        {...tableProps}
        columnConfig={columnConfig}
        rowConfig={{
          // Whole-row click as a convenience, on top of the anchor in the title
          // cell. `onClick` + navigate rather than `getHref`, because without
          // BUIProvider a bui href does a full page reload (see the title cell).
          onClick: row => {
            const href = hrefFor(row);
            if (href) {
              navigate(href);
            }
          },
        }}
        emptyState={
          <Text variant="body-medium" color="secondary">
            {emptyText(searchTerm, filtered, emptyMessage)}
          </Text>
        }
      />
    </Flex>
  );
}
