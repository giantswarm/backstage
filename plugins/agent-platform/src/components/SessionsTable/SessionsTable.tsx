import { SyntheticEvent, useCallback, useMemo } from 'react';
import {
  Avatar,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  SearchField,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useNavigate } from 'react-router-dom';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';
import { sessionDetailRouteRef } from '../../routes';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import {
  SessionRow,
  sessionSearchFn,
  sortSessionsBy,
} from '../SessionsDataProvider/helpers';

/** The avatar is one line of text tall; request 2× for hi-dpi crispness. */
const ROW_AVATAR_SIZE: AvatarSize = 48;

/**
 * Keep a press on the title anchor from also reaching the row.
 *
 * The row's `onClick` is react-aria's `onAction`, which fires for a press anywhere
 * inside the row — the anchor included, since `usePress` has no exemption for
 * interactive descendants. So a single click on the title used to navigate
 * *twice*: once through the anchor, once through the row. On a plain click that
 * pushed the same path onto the history stack twice, and Back needed two presses
 * to return to the list; with cmd held it was worse, because react-router leaves a
 * modified event to the browser, so the session opened in a new tab *and* the
 * current tab navigated away — defeating the reason the anchor exists.
 *
 * `usePress` works off pointer events rather than `click`, so `pointerdown` and
 * `pointerup` are the ones that have to be stopped; `click` is stopped too, for
 * the synthetic-click path. Stopping propagation does not set `defaultPrevented`,
 * so the anchor's own react-router navigation still happens.
 */
function stopRowPress(event: SyntheticEvent) {
  event.stopPropagation();
}

/** Dash shown where a value is genuinely unknown. */
function Unknown() {
  return (
    <Text variant="body-medium" color="secondary">
      —
    </Text>
  );
}

function getColumnConfig(
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>,
  hrefFor: (row: SessionRow) => string | undefined,
): ColumnConfig<SessionRow>[] {
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

export type SessionsTableProps = {
  rows: SessionRow[];
  /** True only while no rows exist yet, so the skeleton replaces the table. */
  isLoading?: boolean;
  /** Search debounce; set to 0 in tests so typing takes effect immediately. */
  searchDebounceMs?: number;
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
  isLoading,
  searchDebounceMs = 150,
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

  const columnConfig = useMemo(
    () => getColumnConfig(buildAvatarUrl, hrefFor),
    [buildAvatarUrl, hrefFor],
  );

  const { tableProps, search } = useTable<SessionRow>({
    mode: 'complete',
    // `undefined` rather than `[]` while loading: an empty array renders the
    // empty state, so the skeleton would never show and "No sessions found."
    // would flash before the first rows arrive.
    data: isLoading ? undefined : rows,
    searchFn: sessionSearchFn,
    searchDebounceMs,
    sortFn: sortSessionsBy,
    initialSort: { column: 'updatedAt', direction: 'descending' },
    paginationOptions: { pageSize: 25, pageSizeOptions: [25, 50, 100] },
  });

  return (
    <Flex direction="column" gap="3">
      <SearchField
        aria-label="Search sessions"
        placeholder="Search by session, agent, or installation"
        value={search.value}
        onChange={search.onChange}
      />
      <Table<SessionRow>
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
            No sessions found.
          </Text>
        }
      />
    </Flex>
  );
}
