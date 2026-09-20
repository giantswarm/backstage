import { useCallback, useMemo } from 'react';
import {
  Avatar,
  Badge,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  SearchField,
  Skeleton,
  Table,
  Text,
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
import { AvatarSize } from '../../lib/agentAvatar';
import { toneColor } from '../../lib/sessionStateTone';
import {
  SessionRow,
  sessionSearchFn,
  sortSessionsBy,
} from '../SessionsDataProvider/helpers';
import {
  SessionTableRow,
  sortSessionsByState,
  withSessionStates,
} from './helpers';

/** The avatar is one line of text tall; request 2× for hi-dpi crispness. */
const ROW_AVATAR_SIZE: AvatarSize = 48;

/**
 * The mark on a session whose runtime kagent reports lost — the same two words
 * on the list, the rail and the page's header, so one session reads the same
 * everywhere.
 */
export const RUNTIME_LOST_LABEL = 'Runtime lost';
export const RUNTIME_LOST_TITLE =
  'kagent cannot bring this session’s agent back; the transcript stays readable. Start a new session to carry on.';

/** Dash shown where a value is genuinely unknown. */
function Unknown() {
  return (
    <Text variant="body-medium" color="secondary">
      —
    </Text>
  );
}

/** Copy for each way a state can be missing, kept in one place. */
const STATE_UNKNOWN_LABEL = 'Unknown';
const STATE_UNKNOWN_TITLE =
  'kagent could not be read for this session, so its state is not known. This is not the same as finished.';
const STATE_IDLE_LABEL = 'No activity yet';
const STATE_IDLE_TITLE =
  'This session was started and has no turn that reported a state.';
const STATE_UNEVALUATED_TITLE =
  'This session\u2019s state was not read: it is past the summary\u2019s activity window or its per-pass cap. Open the session to see its state.';

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
        <span title={STATE_UNEVALUATED_TITLE}>
          <Unknown />
        </span>
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
            backgroundColor: toneColor(cell.state.tone, theme),
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
      // kagent truncates titles to 20 characters when deriving them from the
      // first message, so these are short and lossy by nature — nothing to gain
      // from a wide column.
      id: 'title',
      label: 'Session',
      isRowHeader: true,
      isSortable: true,
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
            <Flex align="center" gap="2">
              {href ? (
                <Link
                  to={href}
                  onPointerDown={stopRowPress}
                  onPointerUp={stopRowPress}
                  onClick={stopRowPress}
                >
                  {row.title}
                </Link>
              ) : (
                <Text variant="body-medium">{row.title}</Text>
              )}
              {/* Said in the list, before the person opens it and types: a
                  session kagent reports lost takes no message any more. The
                  page explains and offers the way on. */}
              {row.runtimeLost && (
                <Badge size="small" title={RUNTIME_LOST_TITLE}>
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
      cell: row => (
        <Cell>
          {row.agentName ? (
            <Flex align="center" gap="2">
              <Avatar
                size="small"
                purpose="decoration"
                name={row.agentName}
                src={
                  buildAvatarUrl(
                    row.installation,
                    row.agentTechnicalName ?? '',
                    {
                      size: ROW_AVATAR_SIZE,
                    },
                  ) ?? ''
                }
              />
              <Text
                variant="body-medium"
                truncate
                title={row.agentName}
                style={{ minWidth: 0 }}
              >
                {row.agentName}
              </Text>
            </Flex>
          ) : (
            <Unknown />
          )}
        </Cell>
      ),
    },
    {
      // Between the agent and the installation: what the session is doing reads
      // with what it is, before where it runs.
      id: 'state',
      label: 'State',
      isSortable: true,
      cell: row => <StateCell row={row} isLoading={isLoadingStates} />,
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      cell: row => <CellText title={row.installation} />,
    },
    {
      id: 'createdAt',
      label: 'Started',
      isSortable: true,
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
    {
      id: 'updatedAt',
      label: 'Last activity',
      isSortable: true,
      cell: row => (
        <Cell>
          {row.updatedAt ? (
            <DateComponent value={row.updatedAt} relative />
          ) : (
            <Unknown />
          )}
        </Cell>
      ),
    },
  ];
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
};

/**
 * Presentational table of sessions, with client-side search and sorting.
 *
 * The page owns the loading indicator for incremental fleet loading and the
 * per-installation notices; this renders rows, the search field, and the empty
 * state.
 */
export function SessionsTable({
  rows,
  sessionStates,
  isLoading,
  searchDebounceMs = 150,
  hideColumns,
  showSearch = true,
  showPagination = true,
  emptyMessage = 'No sessions found.',
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

  const { tableProps, search } = useTable<SessionTableRow>({
    mode: 'complete',
    // `undefined` rather than `[]` while loading: an empty array renders the
    // empty state, so the skeleton would never show and "No sessions found."
    // would flash before the first rows arrive.
    data: isLoading ? undefined : stateRows,
    searchFn: sessionSearchFn,
    searchDebounceMs,
    sortFn,
    initialSort: { column: 'updatedAt', direction: 'descending' },
    paginationOptions: showPagination
      ? { pageSize: 25, pageSizeOptions: [25, 50, 100] }
      : { type: 'none' },
  });

  return (
    <Flex direction="column" gap="3">
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
            {emptyMessage}
          </Text>
        }
      />
    </Flex>
  );
}
