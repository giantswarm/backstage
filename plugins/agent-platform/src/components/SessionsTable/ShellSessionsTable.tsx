import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import {
  Badge,
  Button,
  ButtonIcon,
  Cell,
  CellText,
  Column,
  Flex,
  Row,
  SearchField,
  Skeleton,
  TableBody,
  TableHeader,
  TableRoot,
  Text,
  useTable,
  VisuallyHidden,
} from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CatalogFilterBar,
  catalogFilterDimensions,
  CatalogNoMatch,
  catalogFilterKey,
  type CatalogFilterSelection,
  formatLocalDateFull,
  isCatalogFiltered,
  StackedRowList,
  StatusDot,
  stopRowPress,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import { sessionDetailRouteRef } from '../../routes';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useDeleteSession } from '../../hooks/useDeleteSession';
import { useKagentCapabilities } from '../../hooks/useKagentCapabilities';
import { usePinnedSessions } from '../../hooks/usePinnedSessions';
import { useRenameSession } from '../../hooks/useRenameSession';
import { PinIcon } from '../PinIcon';
import { SessionRow, sessionSearchFn } from '../SessionsDataProvider/helpers';
import { SessionActionsMenu } from '../SessionDetailPage/SessionActionsMenu';
import { useSessionNotificationSettings } from '../../hooks/useSessionNotificationRecord';
import type { SessionNotificationsControl } from '../SessionDetailPage/SessionActionsMenu';
import { SessionRenameDialog } from '../SessionDetailPage/SessionRenameDialog';
import {
  compareSessionRecency,
  formatSessionTime,
  PINNED_GROUP_LABEL,
  SESSION_DAY_GROUPS,
  SessionListGroup,
  SessionDayGroup,
  sessionDayGroup,
  SessionTableRow,
  STATE_IDLE_LABEL,
  STATE_UNKNOWN_LABEL,
  withSessionStates,
} from './helpers';
import {
  filterSessionsBySelection,
  parseSessionsListSearch,
  sessionFacets,
  sessionSelectionOf,
} from './filters';
import {
  RUNTIME_LOST_LABEL,
  RUNTIME_LOST_TITLE,
  SessionAgent,
  TRUNCATE,
  Unknown,
} from './cells';
import type { SessionsTableProps } from './SessionsTable';
import { sessionStackedRow } from './stackedRows';
import { sessionStateDotVar } from '../../lib/stableClassNames';
import { SEARCH_MIN } from '../../lib/toolset';

/** No picks: every facet keeps everything. */
const NO_SELECTION: CatalogFilterSelection = {};

/** Sessions shown at first and added by each Load more, as the classic list pages by. */
export const SESSIONS_PAGE_SIZE = 25;

/**
 * The most session rows mounted at once (T39). The data layer fetches every
 * session (search and the palette need them all), but each rendered row
 * carries a pin toggle and a rename/delete menu with its own hooks and dialog,
 * so *Load more* past this slides the window down instead of growing it — the
 * rows it leaves behind are a *Show previous* away at the top.
 */
export const MAX_RENDERED_SESSIONS = 4 * SESSIONS_PAGE_SIZE;

/** The attribute naming the session a row's menu belongs to. */
const ROW_ATTRIBUTE = 'data-session-row';

const STATE_UNKNOWN_TITLE =
  'kagent could not be read for this session, so its state is unknown, which is not the same as idle.';
const STATE_IDLE_TITLE = 'It started, but no turn has reported a state.';
const STATE_UNEVALUATED_LABEL = 'Not loaded';
const STATE_UNEVALUATED_TITLE = 'Open the session to see its state.';

type ShellColumn = {
  id: string;
  label: string;
  /** Hidden from sight, kept for assistive technology. */
  hideLabel?: boolean;
  isRowHeader?: boolean;
  /**
   * The same width in every day's table, so the columns line up from one
   * group to the next. The column without one takes the rest.
   */
  width?: string;
  cell: (row: SessionTableRow, group: SessionListGroup) => JSX.Element;
};

/** The state of the session's newest turn, in the shell's words. */
function ShellStateCell({
  row,
  isLoading,
}: {
  row: SessionTableRow;
  isLoading: boolean;
}) {
  const cell = row.stateCell;
  switch (cell.kind) {
    case 'unevaluated':
      return (
        <Cell>
          {isLoading ? (
            <Skeleton height="16px" />
          ) : (
            <Text
              variant="body-medium"
              color="secondary"
              title={STATE_UNEVALUATED_TITLE}
            >
              {STATE_UNEVALUATED_LABEL}
            </Text>
          )}
        </Cell>
      );
    case 'unreadable':
      return (
        <Cell>
          <span title={STATE_UNKNOWN_TITLE}>
            <StatusDot
              tone="neutral"
              label={STATE_UNKNOWN_LABEL}
              colorVar={sessionStateDotVar('neutral')}
            />
          </span>
        </Cell>
      );
    case 'idle':
      return (
        <Cell>
          <span title={STATE_IDLE_TITLE}>
            <StatusDot
              tone="neutral"
              label={STATE_IDLE_LABEL}
              colorVar={sessionStateDotVar('neutral')}
            />
          </span>
        </Cell>
      );
    default:
      return (
        <Cell>
          <StatusDot
            tone={cell.state.tone}
            label={cell.state.label}
            colorVar={sessionStateDotVar(cell.state.tone)}
          />
        </Cell>
      );
  }
}

/**
 * A row's rename, notifications and delete menu.
 *
 * Presses inside it, the menu's popover and dialogs included (React events
 * bubble through portals), are kept from the row, which would otherwise open
 * the session.
 */
function SessionRowMenu({
  row,
  onDeleted,
  notifications,
}: {
  row: SessionTableRow;
  onDeleted: () => void;
  notifications: SessionNotificationsControl;
}) {
  const deletion = useDeleteSession(row.installation, row.sessionId);
  const rename = useRenameSession(row.installation, row.sessionId);
  const { isUserScoped } = useKagentCapabilities(row.installation);
  const [isRenameOpen, setRenameOpen] = useState(false);
  const { reset: resetRename } = rename;
  const openRename = useCallback(() => {
    resetRename();
    setRenameOpen(true);
  }, [resetRename]);

  return (
    <span
      role="presentation"
      {...{ [ROW_ATTRIBUTE]: row.id }}
      onPointerDown={stopRowPress}
      onPointerUp={stopRowPress}
      onClick={stopRowPress}
    >
      <SessionActionsMenu
        title={row.title}
        deletion={deletion}
        onRename={openRename}
        isUserScoped={isUserScoped}
        triggerLabel={`More actions for “${row.title}”`}
        onDeleted={onDeleted}
        notifications={notifications}
      />
      <SessionRenameDialog
        title={row.title}
        isOpen={isRenameOpen}
        onOpenChange={setRenameOpen}
        isRenaming={rename.isRenaming}
        error={rename.error?.message}
        onConfirm={async name => {
          try {
            await rename.renameSession(name);
          } catch {
            // Left to the dialog, which stays open and renders the error.
            return;
          }
          setRenameOpen(false);
        }}
        isUserScoped={isUserScoped}
      />
    </span>
  );
}

/**
 * A row's pin toggle. Presses are kept from the row, which would otherwise
 * open the session — same handling as the row's menu.
 */
function RowPinButton({
  row,
  onToggle,
}: {
  row: SessionTableRow;
  onToggle: (id: string) => void;
}) {
  const pinned = row.pinned === true;
  return (
    <span
      role="presentation"
      onPointerDown={stopRowPress}
      onPointerUp={stopRowPress}
      onClick={stopRowPress}
    >
      <ButtonIcon
        variant="tertiary"
        icon={<PinIcon filled={pinned} />}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin “${row.title}”` : `Pin “${row.title}”`}
        onPress={() => onToggle(row.id)}
      />
    </span>
  );
}

/** A row's pin and ⋯ menu: the table's last column, a stacked row's end. */
function RowActions({
  row,
  focusAfterDelete,
  onRowDeleted,
  onTogglePin,
  notificationsFor,
}: {
  row: SessionTableRow;
  focusAfterDelete: (rowId: string) => string | undefined;
  onRowDeleted: (focusRowId: string | undefined) => void;
  onTogglePin: (rowId: string) => void;
  notificationsFor: (row: SessionTableRow) => SessionNotificationsControl;
}) {
  const focusRowId = focusAfterDelete(row.id);
  return (
    <Flex align="center" gap="1">
      <RowPinButton row={row} onToggle={onTogglePin} />
      <SessionRowMenu
        row={row}
        onDeleted={() => onRowDeleted(focusRowId)}
        notifications={notificationsFor(row)}
      />
    </Flex>
  );
}

function shellColumns({
  buildAvatarUrl,
  hrefFor,
  isLoadingStates,
  showAgent,
  showInstallation,
  currentYear,
  focusAfterDelete,
  onRowDeleted,
  onTogglePin,
  notificationsFor,
}: {
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>;
  hrefFor: (row: SessionRow) => string | undefined;
  isLoadingStates: boolean;
  /** Off on one agent's own sessions, where every row has that agent. */
  showAgent: boolean;
  showInstallation: boolean;
  currentYear: number;
  /** The row to focus once a row is deleted, by the deleted row's id. */
  focusAfterDelete: (rowId: string) => string | undefined;
  onRowDeleted: (focusRowId: string | undefined) => void;
  onTogglePin: (rowId: string) => void;
  notificationsFor: (row: SessionTableRow) => SessionNotificationsControl;
}): ShellColumn[] {
  const columns: ShellColumn[] = [
    {
      id: 'title',
      label: 'Session',
      isRowHeader: true,
      cell: row => {
        const href = hrefFor(row);
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
  ];
  if (showAgent) {
    columns.push({
      id: 'agentName',
      label: 'Agent',
      width: '22%',
      cell: row => (
        <Cell>
          <SessionAgent row={row} buildAvatarUrl={buildAvatarUrl} />
        </Cell>
      ),
    });
  }
  columns.push({
    id: 'state',
    label: 'State',
    width: '17%',
    cell: row => <ShellStateCell row={row} isLoading={isLoadingStates} />,
  });
  if (showInstallation) {
    columns.push({
      id: 'installation',
      label: 'Environment',
      width: '12%',
      cell: row => <CellText title={row.installation} />,
    });
  }
  columns.push(
    {
      id: 'lastActiveAt',
      label: 'Last active',
      width: '12%',
      cell: (row, group) => (
        <Cell>
          {row.lastActiveAt !== undefined ? (
            <Text variant="body-medium" color="secondary">
              <SessionTime
                at={row.lastActiveAt}
                group={group}
                currentYear={currentYear}
              />
            </Text>
          ) : (
            <Unknown />
          )}
        </Cell>
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      hideLabel: true,
      width: '96px',
      cell: row => (
        <Cell>
          <RowActions
            row={row}
            focusAfterDelete={focusAfterDelete}
            onRowDeleted={onRowDeleted}
            onTogglePin={onTogglePin}
            notificationsFor={notificationsFor}
          />
        </Cell>
      ),
    },
  );
  return columns;
}

/**
 * When the session was last active, as short as its group allows, with the
 * full local stamp on hover.
 */
function SessionTime({
  at,
  group,
  currentYear,
}: {
  at: number;
  group: SessionListGroup;
  currentYear: number;
}) {
  const iso = new Date(at).toISOString();
  return (
    <time dateTime={iso} title={formatLocalDateFull(iso)}>
      {formatSessionTime(at, group, currentYear)}
    </time>
  );
}

/** One day's sessions, a table named by the day's heading. */
function DayTable({
  headingId,
  rows,
  group,
  columns,
  onRowAction,
}: {
  headingId: string;
  rows: SessionTableRow[];
  group: SessionListGroup;
  columns: ShellColumn[];
  onRowAction: (row: SessionTableRow) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <TableRoot aria-labelledby={headingId} aria-label={undefined}>
        <TableHeader columns={columns}>
          {column => (
            <Column
              id={column.id}
              isRowHeader={column.isRowHeader}
              style={column.width ? { width: column.width } : undefined}
            >
              {column.hideLabel ? (
                <VisuallyHidden>{column.label}</VisuallyHidden>
              ) : (
                column.label
              )}
            </Column>
          )}
        </TableHeader>
        <TableBody items={rows} dependencies={[columns, group]}>
          {row => (
            <Row
              id={row.id}
              columns={columns}
              onAction={() => onRowAction(row)}
            >
              {column => column.cell(row, group)}
            </Row>
          )}
        </TableBody>
      </TableRoot>
    </div>
  );
}

/**
 * One day's sessions at phone width: stacked rows named by the day's heading
 * (T22 B1). A table there gave the title ~31px; a row gives it the width and
 * two lines, with the agent, state and last-active time under it.
 */
function DayList({
  label,
  rows,
  group,
  hrefFor,
  buildAvatarUrl,
  isLoadingStates,
  showStates,
  showAgent,
  showInstallation,
  currentYear,
  renderActions,
}: {
  label: string;
  rows: SessionTableRow[];
  group: SessionListGroup;
  hrefFor: (row: SessionRow) => string | undefined;
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>;
  isLoadingStates: boolean;
  showStates: boolean;
  showAgent: boolean;
  showInstallation: boolean;
  currentYear: number;
  renderActions: (row: SessionTableRow) => ReactNode;
}) {
  return (
    <StackedRowList
      aria-label={label}
      rows={rows.map(row =>
        sessionStackedRow({
          row,
          href: hrefFor(row),
          buildAvatarUrl,
          isLoadingStates,
          showState: showStates,
          showAgent,
          showInstallation,
          time:
            row.lastActiveAt !== undefined ? (
              <SessionTime
                at={row.lastActiveAt}
                group={group}
                currentYear={currentYear}
              />
            ) : undefined,
          actions: renderActions(row),
        }),
      )}
    />
  );
}

/**
 * The list's search and filters: the standard search field, and under it the
 * shared catalog dropdowns (T92) — State, Agent and, once something is
 * pinned, Pinned — exactly as the Customize tabs draw them.
 */
function ShellFilterBar({
  searchField,
  rows,
  searchedRows,
  selection,
  onChange,
  showStates,
  showAgents,
}: {
  searchField: ReactNode;
  rows: SessionTableRow[];
  searchedRows: SessionTableRow[];
  selection: CatalogFilterSelection;
  onChange: (selection: CatalogFilterSelection) => void;
  showStates: boolean;
  showAgents: boolean;
}) {
  const facets = useMemo(
    () => sessionFacets(rows, { showStates, showAgents }),
    [rows, showStates, showAgents],
  );
  // Known undercount (platform follow-up, list-scale-inventory #7): the
  // backend evaluates states only for the newest sessions per installation
  // (`agentPlatform.kagent.sessionStates.maxSessions`, default 20, last 7
  // days), so the State counts, a "Waiting for you 0" included, cover those
  // sessions and not the whole list.
  const dimensions = useMemo(
    () => catalogFilterDimensions(rows, searchedRows, facets, selection),
    [rows, searchedRows, facets, selection],
  );

  return (
    <Flex direction="column" gap="3">
      {searchField}
      <CatalogFilterBar
        dimensions={dimensions}
        onSelect={(facetId, values) =>
          onChange({ ...selection, [facetId]: values })
        }
        onClear={() => onChange(NO_SELECTION)}
      />
    </Flex>
  );
}

/**
 * Moves focus to the row holding `rowId`, or to the first day's heading when
 * that row is not on screen.
 */
function focusRowOrHeading(container: HTMLElement, rowId: string | undefined) {
  const marker = rowId
    ? Array.from(
        container.querySelectorAll<HTMLElement>(`[${ROW_ATTRIBUTE}]`),
      ).find(element => element.getAttribute(ROW_ATTRIBUTE) === rowId)
    : undefined;
  // A table's row, or a stacked row's <li> at phone width.
  const row = marker?.closest<HTMLElement>('[role="row"], li');
  if (row) {
    row.focus();
    if (row.contains(document.activeElement)) {
      return;
    }
    const focusable = row.querySelector<HTMLElement>('a[href], button');
    if (focusable) {
      focusable.focus();
      return;
    }
  }
  container.querySelector<HTMLElement>('h2')?.focus();
}

/**
 * The agent-platform shell's sessions list: search and the State, Agent and
 * Pinned dropdowns over one data set, shown as one table per day the sessions
 * were last active (Today, Yesterday, Earlier), most recently active first —
 * the rail's order — a page of sessions at a time.
 */
export function ShellSessionsTable({
  rows,
  sessionStates,
  isLoading,
  searchDebounceMs = 150,
  hideColumns,
  emptyMessage = 'No sessions found.',
}: SessionsTableProps) {
  const buildAvatarUrl = useAgentAvatarUrl();
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const baseId = useId();
  const isPhone = usePhoneLayout();
  const containerRef = useRef<HTMLDivElement>(null);

  const hrefFor = useCallback(
    (row: SessionRow) =>
      sessionDetailRoute?.({
        installation: row.installation,
        sessionId: row.sessionId,
      }),
    [sessionDetailRoute],
  );

  const { isPinned, togglePin } = usePinnedSessions();

  // The pin joined onto the row like the state, so the Pinned filter and group
  // run through the same search/filter/sort pipeline as everything else.
  const stateRows = useMemo(
    () =>
      withSessionStates(rows, sessionStates).map(row =>
        isPinned(row.id) ? { ...row, pinned: true } : row,
      ),
    [rows, sessionStates, isPinned],
  );

  const hasStates = sessionStates !== undefined;
  const isLoadingStates = sessionStates?.isLoading ?? false;
  const showInstallation = !hideColumns?.includes('installation');
  const showAgent = !hideColumns?.includes('agentName');
  // The day groups follow the calendar day, so a list left open past
  // midnight regroups on its next render.
  const now = new Date();
  const today = now.toDateString();
  const currentYear = now.getFullYear();

  // Most recently active first, by the comparator the rail orders with
  // (T100 M1). Pinned rows lead whatever page of the list is shown — the
  // Pinned group is no use when its rows sit past the first Load more.
  const sortPinnedFirst = useCallback((sorted: SessionTableRow[]) => {
    const ordered = [...sorted].sort(compareSessionRecency);
    const pinned = ordered.filter(row => row.pinned);
    return pinned.length > 0
      ? [...pinned, ...ordered.filter(row => !row.pinned)]
      : ordered;
  }, []);

  // A link can open the list already narrowed (`?q=`, `?state=`): the
  // palette's "+N more sessions", the toast for several sessions waiting.
  const { search: locationSearch } = useLocation();
  const [opening] = useState(() => parseSessionsListSearch(locationSearch));

  const { tableProps, search, filter } = useTable<
    SessionTableRow,
    CatalogFilterSelection
  >({
    mode: 'complete',
    data: isLoading ? undefined : stateRows,
    searchFn: sessionSearchFn,
    searchDebounceMs,
    initialSearch: opening.query,
    initialFilter: sessionSelectionOf(opening.filter),
    filterFn: filterSessionsBySelection,
    sortFn: sortPinnedFirst,
    initialSort: { column: 'lastActiveAt', direction: 'descending' },
    paginationOptions: { type: 'none' },
  });

  // Such a link followed while the list is already open changes only the
  // query string; the list follows it. Its own edits never touch the URL.
  const seenSearch = useRef(locationSearch);
  useEffect(() => {
    if (seenSearch.current === locationSearch) {
      return;
    }
    seenSearch.current = locationSearch;
    const next = parseSessionsListSearch(locationSearch);
    search.onChange(next.query);
    filter.onChange(sessionSelectionOf(next.filter));
    // The handlers are fresh every render; the URL alone drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSearch]);

  const [searchTerm, setSearchTerm] = useState(opening.query);
  useDebounce(() => setSearchTerm(search.value.trim()), searchDebounceMs, [
    search.value,
  ]);
  const searchedRows = useMemo(
    () => sessionSearchFn(stateRows, searchTerm),
    [stateRows, searchTerm],
  );

  const selection = filter.value ?? NO_SELECTION;
  const filtered = isCatalogFiltered(selection);
  const selectionKey = catalogFilterKey(selection);

  // The rendered window over the matching rows, `[start, end)`: it grows a
  // page per Load more up to MAX_RENDERED_SESSIONS, then slides. A new search
  // or filter starts over at the first page.
  const [range, setRange] = useState({ start: 0, end: SESSIONS_PAGE_SIZE });
  useEffect(() => {
    setRange({ start: 0, end: SESSIONS_PAGE_SIZE });
  }, [searchTerm, selectionKey]);

  const matching = tableProps.data;
  const total = matching?.length ?? 0;
  // Rows deleted under a window scrolled far down could leave it past the end.
  const start = Math.min(
    range.start,
    Math.max(0, total - MAX_RENDERED_SESSIONS),
  );
  const shown = useMemo(
    () => matching?.slice(start, range.end),
    [matching, start, range.end],
  );

  // Search and filters only once there is something to narrow down (T39):
  // three sessions are read, not searched. Kept while a search or filter is
  // in force, so whatever narrowed the list can still be undone.
  const showFilterBar =
    stateRows.length > SEARCH_MIN || search.value !== '' || filtered;

  const groups = useMemo((): Array<{
    id: SessionListGroup;
    label: string;
    rows: SessionTableRow[];
  }> => {
    // The pinned rows lead under their own heading, whatever day they started,
    // and do not repeat in the day groups.
    const pinnedRows = (shown ?? []).filter(row => row.pinned);
    const byGroup = new Map<SessionDayGroup, SessionTableRow[]>();
    for (const row of shown ?? []) {
      if (row.pinned) {
        continue;
      }
      const group = sessionDayGroup(row.lastActiveAt, now);
      byGroup.set(group, [...(byGroup.get(group) ?? []), row]);
    }
    const dayGroups = SESSION_DAY_GROUPS.flatMap(({ id, label }) => {
      const groupRows = byGroup.get(id);
      return groupRows ? [{ id, label, rows: groupRows }] : [];
    });
    return pinnedRows.length > 0
      ? [
          { id: 'pinned', label: PINNED_GROUP_LABEL, rows: pinnedRows },
          ...dayGroups,
        ]
      : dayGroups;
    // `now` changes every render; the groups only change with its day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, today]);

  // The row after each one in reading order, else the one before it: where
  // focus goes when that row is deleted.
  const focusAfterDelete = useMemo(() => {
    const order = groups.flatMap(group => group.rows.map(row => row.id));
    const next = new Map<string, string | undefined>();
    order.forEach((id, index) => {
      next.set(id, order[index + 1] ?? order[index - 1]);
    });
    return (rowId: string) => next.get(rowId);
  }, [groups]);

  const [focusRequest, setFocusRequest] = useState<{ rowId?: string }>();
  const onRowDeleted = useCallback((rowId: string | undefined) => {
    setFocusRequest({ rowId });
  }, []);
  useEffect(() => {
    const container = containerRef.current;
    if (!focusRequest || !container) {
      return undefined;
    }
    // After react-aria has restored focus for the closed menu and dialog.
    const frame = requestAnimationFrame(() => {
      focusRowOrHeading(container, focusRequest.rowId);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  // Every row's Notifications submenu, from one reading of the record.
  const notificationSettings = useSessionNotificationSettings();
  const notificationsFor = useCallback(
    (row: SessionTableRow): SessionNotificationsControl => ({
      level: notificationSettings.isKnown
        ? notificationSettings.levelOf(row.installation, row.sessionId)
        : undefined,
      onChange: level =>
        notificationSettings.setLevel(row.installation, row.sessionId, level),
    }),
    [notificationSettings],
  );

  const columns = useMemo(
    () =>
      shellColumns({
        buildAvatarUrl,
        hrefFor,
        isLoadingStates,
        showAgent,
        showInstallation,
        currentYear,
        focusAfterDelete,
        onRowDeleted,
        onTogglePin: togglePin,
        notificationsFor,
      }),
    [
      buildAvatarUrl,
      hrefFor,
      isLoadingStates,
      showAgent,
      showInstallation,
      currentYear,
      focusAfterDelete,
      onRowDeleted,
      togglePin,
      notificationsFor,
    ],
  );

  const onRowAction = useCallback(
    (row: SessionTableRow) => {
      const href = hrefFor(row);
      if (href) {
        navigate(href);
      }
    },
    [hrefFor, navigate],
  );

  const loadMore = () => {
    const firstNew = matching?.[range.end];
    const end = range.end + SESSIONS_PAGE_SIZE;
    setRange({ start: Math.max(start, end - MAX_RENDERED_SESSIONS), end });
    if (firstNew) {
      setFocusRequest({ rowId: firstNew.id });
    }
  };

  const showPrevious = () => {
    const previousStart = Math.max(0, start - SESSIONS_PAGE_SIZE);
    setRange({
      start: previousStart,
      end: Math.min(range.end, previousStart + MAX_RENDERED_SESSIONS),
    });
    const firstNew = matching?.[previousStart];
    if (firstNew) {
      setFocusRequest({ rowId: firstNew.id });
    }
  };

  const isSettled = !isLoading && tableProps.data !== undefined;
  const shownTotal = shown?.length ?? 0;
  const shownRange =
    start > 0
      ? `Showing ${start + 1}–${start + shownTotal} of ${total} sessions`
      : `Showing ${shownTotal} of ${total} sessions`;

  return (
    <div ref={containerRef}>
      <Flex direction="column" gap="4">
        {showFilterBar && (
          <ShellFilterBar
            searchField={
              <SearchField
                aria-label="Search sessions"
                placeholder={
                  showAgent ? 'Search by title or agent' : 'Search by title'
                }
                value={search.value}
                onChange={search.onChange}
                style={{ maxWidth: 420 }}
              />
            }
            rows={stateRows}
            searchedRows={searchedRows}
            selection={selection}
            onChange={filter.onChange}
            showStates={hasStates}
            showAgents={showAgent}
          />
        )}

        {isSettled && start > 0 && (
          <Flex justify="center" align="center" gap="3">
            <Text variant="body-medium" color="secondary">
              {`${start} ${start === 1 ? 'session' : 'sessions'} before these`}
            </Text>
            <Button variant="secondary" size="small" onPress={showPrevious}>
              Show previous
            </Button>
          </Flex>
        )}

        {isSettled &&
          groups.length === 0 &&
          (searchTerm || filtered ? (
            // The catalogs' one no-match line; the search field above clears
            // itself.
            <CatalogNoMatch
              plural="sessions"
              search={searchTerm}
              isFiltered={filtered}
              onClearFilters={() => filter.onChange(NO_SELECTION)}
            />
          ) : (
            <Flex direction="column" gap="1" py="6" align="center">
              <Text variant="body-large" weight="bold">
                {emptyMessage}
              </Text>
            </Flex>
          ))}

        {groups.map(group => {
          const headingId = `${baseId}-${group.id}`;
          return (
            <Flex key={group.id} direction="column" gap="2">
              <Text
                as="h2"
                id={headingId}
                tabIndex={-1}
                variant="body-medium"
                weight="bold"
                color="secondary"
              >
                {group.label}
              </Text>
              {isPhone ? (
                <DayList
                  label={group.label}
                  rows={group.rows}
                  group={group.id}
                  hrefFor={hrefFor}
                  buildAvatarUrl={buildAvatarUrl}
                  isLoadingStates={isLoadingStates}
                  showStates={hasStates}
                  showAgent={showAgent}
                  showInstallation={showInstallation}
                  currentYear={currentYear}
                  renderActions={row => (
                    <RowActions
                      row={row}
                      focusAfterDelete={focusAfterDelete}
                      onRowDeleted={onRowDeleted}
                      onTogglePin={togglePin}
                      notificationsFor={notificationsFor}
                    />
                  )}
                />
              ) : (
                <DayTable
                  headingId={headingId}
                  rows={group.rows}
                  group={group.id}
                  columns={columns}
                  onRowAction={onRowAction}
                />
              )}
            </Flex>
          );
        })}

        {isSettled && total > start + shownTotal && (
          <Flex justify="center" align="center" gap="3">
            <Text variant="body-medium" color="secondary">
              {shownRange}
            </Text>
            <Button variant="secondary" size="small" onPress={loadMore}>
              Load more
            </Button>
          </Flex>
        )}
      </Flex>
    </div>
  );
}
