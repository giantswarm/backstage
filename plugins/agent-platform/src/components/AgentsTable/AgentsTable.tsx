import {
  Avatar,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
} from '@backstage/ui';
import { AgentRow } from '../AgentsDataProvider';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';

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
      isRowHeader: true,
      // Hand-rolled (rather than CellProfile) so the avatar can be larger than
      // CellProfile's fixed x-small, and so it always renders — the bui Avatar
      // shows name-derived initials when the image is missing (no resolvable
      // base domain). The avatar seeds from the technical name, not the display
      // name.
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
            <Flex direction="column" gap="1">
              <Text as="p" variant="body-medium">
                {row.name}
              </Text>
              {row.description && (
                <Text variant="body-medium" color="secondary">
                  {row.description}
                </Text>
              )}
            </Flex>
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'installation',
      label: 'Installation',
      cell: row => <CellText title={row.installation} />,
    },
    {
      id: 'namespace',
      label: 'Namespace',
      cell: row => <CellText title={row.namespace || '—'} />,
    },
    {
      id: 'model',
      label: 'Model',
      cell: row => <CellText title={row.model ?? '—'} />,
    },
    {
      id: 'skills',
      label: 'Skills',
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

  return (
    <Table<AgentRow>
      columnConfig={getColumnConfig(buildAvatarUrl)}
      data={rows}
      pagination={{ type: 'none' }}
      emptyState={
        <Text variant="body-medium" color="secondary">
          No agents found.
        </Text>
      }
    />
  );
}
