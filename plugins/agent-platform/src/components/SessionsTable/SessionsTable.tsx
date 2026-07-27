import { useMemo } from 'react';
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
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import {
  SessionRow,
  sessionSearchFn,
  sortSessionsBy,
} from '../SessionsDataProvider/helpers';

/** The avatar is one line of text tall; request 2× for hi-dpi crispness. */
const ROW_AVATAR_SIZE: AvatarSize = 48;

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
      cell: row => <CellText title={row.title} />,
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
  const columnConfig = useMemo(
    () => getColumnConfig(buildAvatarUrl),
    [buildAvatarUrl],
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
        emptyState={
          <Text variant="body-medium" color="secondary">
            No sessions found.
          </Text>
        }
      />
    </Flex>
  );
}
