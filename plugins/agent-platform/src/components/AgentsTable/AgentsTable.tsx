import { useCallback, useMemo, useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import {
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
import { AgentRow, agentSearchFn, sortAgentsBy } from '../AgentsDataProvider';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { agentDetailRouteRef } from '../../routes';
import { AvatarSize } from '../../lib/agentAvatar';
import {
  stopRowPress,
  useVisibleSort,
} from '@giantswarm/backstage-plugin-ui-react';
import { describeToolset } from '../../lib/toolset';
import {
  AgentModelCell,
  isAgentRowMuted,
  MUTED_ROW_STYLE,
} from './modelStatus';
import { AgentReadinessCell } from './readinessStatus';
import { AgentAvatar } from '../AgentAvatar';

/** The default order, and the one while the Installation column is hidden. */
const BY_INSTALLATION = {
  column: 'installation',
  direction: 'ascending',
} as const;
const BY_NAME = { column: 'name', direction: 'ascending' } as const;

/**
 * The avatar spans roughly two lines of text (`large` = 40px). Request 2× that
 * from the allowlist for crispness on hi-dpi displays.
 */
const LIST_AVATAR_SIZE: AvatarSize = 96;

function getColumnConfig(
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>,
  hrefFor: (row: AgentRow) => string | undefined,
): ColumnConfig<AgentRow>[] {
  return [
    {
      id: 'name',
      label: 'Agent',
      isSortable: true,
      isRowHeader: true,
      // The widest column: the name is what a reader scans the list for, and
      // the description under it is only useful at some length.
      defaultWidth: '3fr',
      minWidth: 240,
      // Hand-rolled (rather than CellProfile) so the avatar can be larger than
      // CellProfile's fixed x-small and stay top-aligned, and so it always
      // renders — the bui Avatar shows name-derived initials when the image is
      // missing (no resolvable base domain). The avatar seeds from the
      // technical name, not the display name. The text mirrors CellText's
      // truncation (single-line, ellipsis, full text on hover) so this column
      // wraps/overflows consistently with the others.
      cell: row => {
        const href = hrefFor(row);

        // A real anchor on the name, *as well as* the whole-row onClick below.
        // The anchor is what makes cmd/middle-click open a new tab and what gives
        // keyboard users something focusable; the row click is the convenience
        // affordance. `Link` from core-components routes client-side, which
        // `rowConfig.getHref` would not: BUIProvider is not mounted in this app,
        // so react-aria's RouterProvider is inactive and a bui `href` would
        // trigger a full page reload.
        //
        // The two affordances must not both fire for one click — see
        // {@link stopRowPress}.
        return (
          <Cell style={isAgentRowMuted(row) ? MUTED_ROW_STYLE : undefined}>
            <Flex align="start" gap="3">
              <AgentAvatar
                size="large"
                purpose="decoration"
                name={row.name}
                src={
                  buildAvatarUrl(row.installation, row.technicalName, {
                    size: LIST_AVATAR_SIZE,
                  }) ?? ''
                }
              />
              <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
                {href ? (
                  <Link
                    to={href}
                    title={row.name}
                    onPointerDown={stopRowPress}
                    onPointerUp={stopRowPress}
                    onClick={stopRowPress}
                  >
                    {/* `Text` is here for its truncation (single line, ellipsis,
                        matching CellText), but it sets its own colour — which
                        would silently strip the anchor's, leaving a link that
                        doesn't look like one. `inherit` hands the colour back to
                        the anchor, so this reads like the Sessions table's title
                        link. bui `Text` has no `color="inherit"`. */}
                    <Text
                      as="p"
                      variant="body-medium"
                      truncate
                      style={{ color: 'inherit' }}
                    >
                      {row.name}
                    </Text>
                  </Link>
                ) : (
                  <Text as="p" variant="body-medium" truncate title={row.name}>
                    {row.name}
                  </Text>
                )}
                {row.description && (
                  <Text
                    variant="body-medium"
                    color="secondary"
                    truncate
                    title={row.description}
                  >
                    {row.description}
                  </Text>
                )}
              </Flex>
            </Flex>
          </Cell>
        );
      },
    },
    {
      id: 'readiness',
      label: 'Status',
      isSortable: true,
      defaultWidth: '1.25fr',
      minWidth: 150,
      cell: row => <AgentReadinessCell row={row} />,
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      defaultWidth: '1fr',
      minWidth: 110,
      cell: row => (
        <CellText
          title={row.installation}
          color={isAgentRowMuted(row) ? 'secondary' : undefined}
        />
      ),
    },
    {
      id: 'namespace',
      label: 'Namespace',
      isSortable: true,
      defaultWidth: '1fr',
      minWidth: 110,
      cell: row => (
        <CellText
          title={row.namespace || '—'}
          color={isAgentRowMuted(row) ? 'secondary' : undefined}
        />
      ),
    },
    {
      id: 'model',
      label: 'Model',
      isSortable: true,
      defaultWidth: '1.5fr',
      minWidth: 140,
      cell: row => <AgentModelCell row={row} />,
    },
    {
      id: 'toolset',
      label: 'Toolset',
      isSortable: false,
      defaultWidth: '1.5fr',
      minWidth: 150,
      // The declaration as the agent's carrier RemoteMCPServer carries it, in a
      // few words — the detail page's Toolset card resolves it for the viewer.
      // "No tools" is an absence, so it steps back like the Sessions table's
      // "Not loaded".
      cell: row => {
        const toolset = describeToolset(row.toolset);
        return (
          <CellText
            title={toolset.summary}
            description={toolset.detail}
            color={
              toolset.inactive || isAgentRowMuted(row) ? 'secondary' : undefined
            }
          />
        );
      },
    },
    {
      id: 'skills',
      label: 'Skills',
      isSortable: true,
      defaultWidth: '0.6fr',
      // Room for the header and its sort arrow, not only the digits.
      minWidth: 100,
      cell: row => (
        <Cell>
          <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
            {row.skillCount}
          </Text>
        </Cell>
      ),
    },
  ];
}

/** Columns the page may drop because every row would repeat the same value. */
export type HideableAgentColumn = 'installation' | 'namespace';

export type AgentsTableProps = {
  rows: AgentRow[];
  /** Columns to leave out. */
  hideColumns?: ReadonlyArray<HideableAgentColumn>;
  /** Search debounce; set to 0 in tests so typing takes effect immediately. */
  searchDebounceMs?: number;
};

/**
 * Presentational table of agents, with client-side search and sorting. The page
 * owns loading (it shows a progress bar and hides the table until the first
 * agents arrive) and the unreachable-installations notice; this renders the
 * search field, the rows and the "no agents" empty state.
 */
export function AgentsTable({
  rows,
  hideColumns,
  searchDebounceMs = 150,
}: AgentsTableProps) {
  const buildAvatarUrl = useAgentAvatarUrl();
  const navigate = useNavigate();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  // All three parameters are needed: an Agent name is only unique within a
  // namespace on one installation. Undefined when the route isn't bound, in which
  // case rows render as plain text rather than as links that go nowhere.
  const hrefFor = useCallback(
    (row: AgentRow) =>
      agentDetailRoute?.({
        installation: row.installation,
        namespace: row.namespace,
        name: row.technicalName,
      }),
    [agentDetailRoute],
  );

  const hiddenKey = hideColumns?.join(',') ?? '';
  const columnConfig = useMemo(() => {
    const hidden = new Set<string>(hiddenKey ? hiddenKey.split(',') : []);
    return getColumnConfig(buildAvatarUrl, hrefFor).filter(
      column => !hidden.has(String(column.id)),
    );
  }, [buildAvatarUrl, hrefFor, hiddenKey]);

  // `agentSearchFn` matches the installation whether or not its column shows;
  // the placeholder only offers it where the reader can see it.
  const searchPlaceholder = hiddenKey.split(',').includes('installation')
    ? 'Search by name or description'
    : 'Search by name, description or installation';

  // Client-side sorting. The initial sort is installation-then-name, which is the
  // ordering this list had before it was sortable (see `sortAgentsBy`), so
  // enabling sorting doesn't change the default view. Sorting by Status once puts
  // the agents needing attention on top.
  //
  // Pagination stays off, unlike SessionsTable. `useCompletePagination` only
  // resets its offset when the page size or the sort/filter/search query changes
  // — never when the data shrinks. Since this list polls, a deletion elsewhere
  // (or an installation dropping out of the reachable set, which prunes its
  // cached rows) could leave the offset past the end of a shrunken list, slicing
  // to nothing and showing "No agents found." while agents exist, recoverable
  // only by paging back. `type: 'none'` skips the slice entirely.
  const { sort, onSortChange } = useVisibleSort(
    BY_INSTALLATION,
    BY_NAME,
    hideColumns,
  );
  const { tableProps, search } = useTable<AgentRow>({
    mode: 'complete',
    data: rows,
    searchFn: agentSearchFn,
    searchDebounceMs,
    sortFn: sortAgentsBy,
    sort,
    onSortChange,
    paginationOptions: { type: 'none' },
  });

  // The term the rows are filtered by: `useTable` debounces the search and
  // does not hand the debounced value back, so the empty state keeps its own.
  const [searchTerm, setSearchTerm] = useState('');
  useDebounce(() => setSearchTerm(search.value.trim()), searchDebounceMs, [
    search.value,
  ]);

  return (
    <Flex direction="column" gap="3">
      <SearchField
        aria-label="Search agents"
        placeholder={searchPlaceholder}
        value={search.value}
        onChange={search.onChange}
      />
      <Table<AgentRow>
        {...tableProps}
        columnConfig={columnConfig}
        rowConfig={{
          // Whole-row click as a convenience, on top of the anchor on the name.
          // `onClick` + navigate rather than `getHref`, because without BUIProvider
          // a bui href does a full page reload (see the name cell).
          onClick: row => {
            const href = hrefFor(row);
            if (href) {
              navigate(href);
            }
          },
        }}
        emptyState={
          <Text variant="body-medium" color="secondary">
            {searchTerm
              ? `No agents match "${searchTerm}".`
              : 'No agents found.'}
          </Text>
        }
      />
    </Flex>
  );
}
