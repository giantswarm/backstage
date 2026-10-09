import { useCallback, useEffect, useId, useMemo, useState } from 'react';
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
import { STABLE_CLASS_NAMES } from '../../lib/stableClassNames';

const ALL_AGENTS = '';

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
            <StatusDot tone="neutral" label={STATE_UNKNOWN_LABEL} />
          </span>
        </Cell>
      );
    case 'idle':
      return (
        <Cell>
          <span title={STATE_IDLE_TITLE}>
            <StatusDot tone="neutral" label={STATE_IDLE_LABEL} />
          </span>
        </Cell>
      );
    default:
      return (
        <Cell>
          <StatusDot tone={cell.state.tone} label={cell.state.shellLabel} />
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
function SessionRowMenu({ row }: { row: SessionTableRow }) {
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
}: {
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>;
  hrefFor: (row: SessionRow) => string | undefined;
  isLoadingStates: boolean;
  showInstallation: boolean;
  currentYear: number;
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
      cell: row => (
        <Cell>
          <SessionRowMenu row={row} />
        </Cell>
      ),
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
  rows,
  searchedRows,
  isLoading,
  filter,
  onChange,
  showStates,
}: {
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
        style={{ minWidth: 200, maxWidth: 280 }}
      />
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
 * The agent-platform shell's sessions list: search, an agent picker and the
 * state chips over one data set, shown as one table per day the sessions
 * started (Today, Yesterday, Earlier), newest first.
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
  const columns = useMemo(
    () =>
      shellColumns({
        buildAvatarUrl,
        hrefFor,
        isLoadingStates,
        showInstallation,
        currentYear,
      }),
    [buildAvatarUrl, hrefFor, isLoadingStates, showInstallation, currentYear],
  );

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

  const groups = useMemo(() => {
    const byGroup = new Map<SessionDayGroup, SessionTableRow[]>();
    for (const row of tableProps.data ?? []) {
      const group = sessionDayGroup(row.createdAt, now);
      byGroup.set(group, [...(byGroup.get(group) ?? []), row]);
    }
    return SESSION_DAY_GROUPS.flatMap(({ id, label }) => {
      const groupRows = byGroup.get(id);
      return groupRows ? [{ id, label, rows: groupRows }] : [];
    });
    // `now` changes every render; the groups only change with its day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableProps.data, today]);

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

  const isSettled = !isLoading && tableProps.data !== undefined;

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="3">
        <SearchField
          aria-label="Search sessions"
          placeholder="Search by title or agent"
          value={search.value}
          onChange={search.onChange}
          style={{ maxWidth: 420 }}
        />
        <ShellFilterBar
          rows={stateRows}
          searchedRows={searchedRows}
          isLoading={Boolean(isLoading)}
          filter={activeFilter}
          onChange={filter.onChange}
          showStates={hasStates}
        />
      </Flex>

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
    </Flex>
  );
}
