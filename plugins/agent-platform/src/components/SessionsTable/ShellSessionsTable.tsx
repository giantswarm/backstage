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
  Cell,
  CellText,
  Column,
  Flex,
  Row,
  SearchField,
  Select,
  Skeleton,
  TableBody,
  TableHeader,
  TableRoot,
  Text,
  ToggleButton,
  ToggleButtonGroup,
  useTable,
  VisuallyHidden,
} from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useNavigate } from 'react-router-dom';
import { StatusDot, stopRowPress } from '@giantswarm/backstage-plugin-ui-react';
import { sessionDetailRouteRef } from '../../routes';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useDeleteSession } from '../../hooks/useDeleteSession';
import { useKagentCapabilities } from '../../hooks/useKagentCapabilities';
import { useRenameSession } from '../../hooks/useRenameSession';
import {
  SessionRow,
  sessionSearchFn,
  sortSessionsBy,
} from '../SessionsDataProvider/helpers';
import { SessionActionsMenu } from '../SessionDetailPage/SessionActionsMenu';
import { SessionRenameDialog } from '../SessionDetailPage/SessionRenameDialog';
import {
  formatSessionStart,
  SESSION_DAY_GROUPS,
  SessionDayGroup,
  sessionDayGroup,
  SessionTableRow,
  STATE_IDLE_LABEL,
  STATE_UNKNOWN_LABEL,
  withSessionStates,
} from './helpers';
import {
  countSessionsByState,
  filterSessions,
  isSessionsFilterActive,
  NO_SESSIONS_FILTER,
  SessionsFilter,
  SessionStateFilter,
  sessionAgentOptions,
  SHELL_SESSION_STATE_FILTERS,
} from './filters';
import {
  RUNTIME_LOST_LABEL,
  RUNTIME_LOST_TITLE,
  SessionAgent,
  TRUNCATE,
  Unknown,
} from './cells';
import type { SessionsTableProps } from './SessionsTable';
import {
  sessionStateDotVar,
  STABLE_CLASS_NAMES,
} from '../../lib/stableClassNames';

const ALL_AGENTS = '';

/** Sessions shown at first and added by each Load more, as the classic list pages by. */
export const SESSIONS_PAGE_SIZE = 25;

/** The attribute naming the session a row's menu belongs to. */
const ROW_ATTRIBUTE = 'data-session-row';

const STATE_UNKNOWN_TITLE =
  'kagent could not be read for this session, so its state is not known. This is not the same as finished.';
const STATE_IDLE_TITLE =
  'This session was started and has no turn that reported a state.';
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
  cell: (row: SessionTableRow, group: SessionDayGroup) => JSX.Element;
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
            label={cell.state.shellLabel}
            colorVar={sessionStateDotVar(cell.state.tone)}
          />
        </Cell>
      );
  }
}

/**
 * A row's rename and delete menu.
 *
 * Presses inside it, the menu's popover and dialogs included (React events
 * bubble through portals), are kept from the row, which would otherwise open
 * the session.
 */
function SessionRowMenu({
  row,
  onDeleted,
}: {
  row: SessionTableRow;
  onDeleted: () => void;
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

function shellColumns({
  buildAvatarUrl,
  hrefFor,
  isLoadingStates,
  showInstallation,
  currentYear,
  focusAfterDelete,
  onRowDeleted,
}: {
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>;
  hrefFor: (row: SessionRow) => string | undefined;
  isLoadingStates: boolean;
  showInstallation: boolean;
  currentYear: number;
  /** The row to focus once a row is deleted, by the deleted row's id. */
  focusAfterDelete: (rowId: string) => string | undefined;
  onRowDeleted: (focusRowId: string | undefined) => void;
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
    {
      id: 'agentName',
      label: 'Agent',
      width: '22%',
      cell: row => (
        <Cell>
          <SessionAgent row={row} buildAvatarUrl={buildAvatarUrl} />
        </Cell>
      ),
    },
    {
      id: 'state',
      label: 'State',
      width: '17%',
      cell: row => <ShellStateCell row={row} isLoading={isLoadingStates} />,
    },
  ];
  if (showInstallation) {
    columns.push({
      id: 'installation',
      label: 'Installation',
      width: '12%',
      cell: row => <CellText title={row.installation} />,
    });
  }
  columns.push(
    {
      id: 'createdAt',
      label: 'Started',
      width: '12%',
      cell: (row, group) => (
        <Cell>
          {row.createdAt ? (
            <Text variant="body-medium" color="secondary">
              <time
                dateTime={row.createdAt}
                title={new Date(row.createdAt).toLocaleString()}
              >
                {formatSessionStart(row.createdAt, group, currentYear)}
              </time>
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
      width: '56px',
      cell: row => {
        const focusRowId = focusAfterDelete(row.id);
        return (
          <Cell>
            <SessionRowMenu
              row={row}
              onDeleted={() => onRowDeleted(focusRowId)}
            />
          </Cell>
        );
      },
    },
  );
  return columns;
}

function emptyTitle(
  searchTerm: string,
  filtered: boolean,
  emptyMessage: string,
): string {
  if (searchTerm) {
    return `No sessions match “${searchTerm}”`;
  }
  return filtered ? 'No sessions match the filters' : emptyMessage;
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
  group: SessionDayGroup;
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

function ShellFilterBar({
  searchField,
  rows,
  searchedRows,
  isLoading,
  filter,
  onChange,
  showStates,
}: {
  searchField: ReactNode;
  rows: SessionTableRow[];
  searchedRows: SessionTableRow[];
  isLoading: boolean;
  filter: SessionsFilter;
  onChange: (filter: SessionsFilter) => void;
  showStates: boolean;
}) {
  const counts = useMemo(
    () => countSessionsByState(searchedRows, filter.agent),
    [searchedRows, filter.agent],
  );
  const agentOptions = useMemo(() => sessionAgentOptions(rows), [rows]);

  // A picked agent whose sessions are gone would leave the list empty behind
  // a picker that no longer offers it.
  const pickedAgentGone =
    !isLoading &&
    filter.agent !== undefined &&
    !agentOptions.some(option => option.id === filter.agent);
  useEffect(() => {
    if (pickedAgentGone) {
      onChange({ ...filter, agent: undefined });
    }
  }, [pickedAgentGone, filter, onChange]);

  const chips = SHELL_SESSION_STATE_FILTERS.filter(
    ({ id, whenPresent }) =>
      !whenPresent || counts[id] > 0 || filter.state === id,
  );

  return (
    <Flex direction="column" gap="3">
      <Flex align="end" gap="3" style={{ flexWrap: 'wrap' }}>
        {searchField}
        <Select
          label="Agent"
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
          style={{ minWidth: 200, maxWidth: 280 }}
        />
      </Flex>
      {showStates && (
        <ToggleButtonGroup
          className={STABLE_CLASS_NAMES.stateFilter}
          aria-label="Filter by state"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[filter.state]}
          onSelectionChange={keys => {
            const next = [...keys][0];
            if (chips.some(({ id }) => id === next)) {
              onChange({ ...filter, state: next as SessionStateFilter });
            }
          }}
        >
          {chips.map(({ id, label }) => (
            <ToggleButton key={id} id={id} size="small">
              {`${label} ${counts[id]}`}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
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
  const row = marker?.closest<HTMLElement>('[role="row"]');
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
 * The agent-platform shell's sessions list: search, an agent picker and the
 * state chips over one data set, shown as one table per day the sessions
 * started (Today, Yesterday, Earlier), newest first, a page of sessions at a
 * time.
 */
export function ShellSessionsTable({
  rows,
  sessionStates,
  isLoading,
  searchDebounceMs = 150,
  hideColumns,
  emptyMessage = 'No sessions found.',
}: Omit<SessionsTableProps, 'layout'>) {
  const buildAvatarUrl = useAgentAvatarUrl();
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const hrefFor = useCallback(
    (row: SessionRow) =>
      sessionDetailRoute?.({
        installation: row.installation,
        sessionId: row.sessionId,
      }),
    [sessionDetailRoute],
  );

  const stateRows = useMemo(
    () => withSessionStates(rows, sessionStates),
    [rows, sessionStates],
  );

  const hasStates = sessionStates !== undefined;
  const isLoadingStates = sessionStates?.isLoading ?? false;
  const showInstallation = !hideColumns?.includes('installation');
  // The day groups follow the calendar day, so a list left open past
  // midnight regroups on its next render.
  const now = new Date();
  const today = now.toDateString();
  const currentYear = now.getFullYear();

  const { tableProps, search, filter } = useTable<
    SessionTableRow,
    SessionsFilter
  >({
    mode: 'complete',
    data: isLoading ? undefined : stateRows,
    searchFn: sessionSearchFn,
    searchDebounceMs,
    initialFilter: NO_SESSIONS_FILTER,
    filterFn: filterSessions,
    sortFn: sortSessionsBy,
    initialSort: { column: 'createdAt', direction: 'descending' },
    paginationOptions: { type: 'none' },
  });

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

  // A new search or filter starts over at the first page.
  const [shownCount, setShownCount] = useState(SESSIONS_PAGE_SIZE);
  useEffect(() => {
    setShownCount(SESSIONS_PAGE_SIZE);
  }, [searchTerm, activeFilter]);

  const matching = tableProps.data;
  const shown = useMemo(
    () => matching?.slice(0, shownCount),
    [matching, shownCount],
  );

  const groups = useMemo(() => {
    const byGroup = new Map<SessionDayGroup, SessionTableRow[]>();
    for (const row of shown ?? []) {
      const group = sessionDayGroup(row.createdAt, now);
      byGroup.set(group, [...(byGroup.get(group) ?? []), row]);
    }
    return SESSION_DAY_GROUPS.flatMap(({ id, label }) => {
      const groupRows = byGroup.get(id);
      return groupRows ? [{ id, label, rows: groupRows }] : [];
    });
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

  const columns = useMemo(
    () =>
      shellColumns({
        buildAvatarUrl,
        hrefFor,
        isLoadingStates,
        showInstallation,
        currentYear,
        focusAfterDelete,
        onRowDeleted,
      }),
    [
      buildAvatarUrl,
      hrefFor,
      isLoadingStates,
      showInstallation,
      currentYear,
      focusAfterDelete,
      onRowDeleted,
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

  const clearAll = () => {
    search.onChange('');
    filter.onChange(NO_SESSIONS_FILTER);
  };

  const loadMore = () => {
    const firstNew = matching?.[shownCount];
    setShownCount(count => count + SESSIONS_PAGE_SIZE);
    if (firstNew) {
      setFocusRequest({ rowId: firstNew.id });
    }
  };

  const isSettled = !isLoading && tableProps.data !== undefined;
  const total = matching?.length ?? 0;
  const shownTotal = shown?.length ?? 0;

  return (
    <div ref={containerRef}>
      <Flex direction="column" gap="4">
        <ShellFilterBar
          searchField={
            <SearchField
              aria-label="Search sessions"
              placeholder="Search by title or agent"
              value={search.value}
              onChange={search.onChange}
              style={{ flex: '1 1 320px', maxWidth: 420 }}
            />
          }
          rows={stateRows}
          searchedRows={searchedRows}
          isLoading={Boolean(isLoading)}
          filter={activeFilter}
          onChange={filter.onChange}
          showStates={hasStates}
        />

        {isSettled && groups.length === 0 && (
          <Flex direction="column" gap="1" py="6" align="center">
            <Text variant="body-large" weight="bold">
              {emptyTitle(searchTerm, filtered, emptyMessage)}
            </Text>
            {searchTerm && (
              <Text variant="body-medium" color="secondary">
                Try another word.
              </Text>
            )}
            {(searchTerm || filtered) && (
              <Button variant="secondary" size="small" onPress={clearAll}>
                Clear search and filters
              </Button>
            )}
          </Flex>
        )}

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
              <DayTable
                headingId={headingId}
                rows={group.rows}
                group={group.id}
                columns={columns}
                onRowAction={onRowAction}
              />
            </Flex>
          );
        })}

        {isSettled && total > shownTotal && (
          <Flex justify="center" align="center" gap="3">
            <Text variant="body-medium" color="secondary">
              {`Showing ${shownTotal} of ${total} sessions`}
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
