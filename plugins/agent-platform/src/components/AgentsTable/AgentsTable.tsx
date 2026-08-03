import { useMemo } from 'react';
import {
  Avatar,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { AgentRow, sortAgentsBy } from '../AgentsDataProvider';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import { AgentReadinessCell } from './readinessStatus';

/**
 * The avatar spans roughly two lines of text (`large` = 40px). Request 2× that
 * from the allowlist for crispness on hi-dpi displays.
 */
const LIST_AVATAR_SIZE: AvatarSize = 96;

function getColumnConfig(
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>,
): ColumnConfig<AgentRow>[] {
  return [
    {
      id: 'name',
      label: 'Agent',
      isSortable: true,
      isRowHeader: true,
      // Hand-rolled (rather than CellProfile) so the avatar can be larger than
      // CellProfile's fixed x-small and stay top-aligned, and so it always
      // renders — the bui Avatar shows name-derived initials when the image is
      // missing (no resolvable base domain). The avatar seeds from the
      // technical name, not the display name. The text mirrors CellText's
      // truncation (single-line, ellipsis, full text on hover) so this column
      // wraps/overflows consistently with the others.
      cell: row => (
        <Cell>
          <Flex align="start" gap="3">
            <Avatar
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
              <Text as="p" variant="body-medium" truncate title={row.name}>
                {row.name}
              </Text>
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
      ),
    },
    {
      id: 'readiness',
      label: 'Status',
      isSortable: true,
      cell: row => <AgentReadinessCell row={row} />,
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      cell: row => <CellText title={row.installation} />,
    },
    {
      id: 'namespace',
      label: 'Namespace',
      isSortable: true,
      cell: row => <CellText title={row.namespace || '—'} />,
    },
    {
      id: 'model',
      label: 'Model',
      isSortable: true,
      cell: row => <CellText title={row.model ?? '—'} />,
    },
    {
      id: 'skills',
      label: 'Skills',
      isSortable: true,
      width: '10%',
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

export type AgentsTableProps = {
  rows: AgentRow[];
};

/**
 * Presentational table of agents. The page owns loading (it shows a progress
 * bar and hides the table until the first agents arrive) and the
 * unreachable-installations notice; this only renders the rows and the
 * "no agents" empty state.
 */
export function AgentsTable({ rows }: AgentsTableProps) {
  const buildAvatarUrl = useAgentAvatarUrl();
  const columnConfig = useMemo(
    () => getColumnConfig(buildAvatarUrl),
    [buildAvatarUrl],
  );

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
  const { tableProps } = useTable<AgentRow>({
    mode: 'complete',
    data: rows,
    sortFn: sortAgentsBy,
    initialSort: { column: 'installation', direction: 'ascending' },
    paginationOptions: { type: 'none' },
  });

  return (
    <Table<AgentRow>
      {...tableProps}
      columnConfig={columnConfig}
      emptyState={
        <Text variant="body-medium" color="secondary">
          No agents found.
        </Text>
      }
    />
  );
}
