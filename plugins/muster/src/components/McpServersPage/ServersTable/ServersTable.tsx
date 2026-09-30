import {
  Cell,
  CellText,
  ColumnConfig,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { isGitOpsManaged } from '../../../lib/gitops';
import { MCPServer } from '../../../lib/k8s';
import { selectRepresentative } from '../../../lib/serverGrouping';
import { ServerListEntry } from '../../../lib/serverList';
import { AUTH_MODE_LABELS, serverAuthMode } from '../../../lib/serverAuthMode';
import {
  FamilyHealthBadge,
  ServerStateBadge,
  useServerPageLinks,
} from '../../shared';

/** The server that speaks for a row's configuration: itself, or a family's representative. */
function configServer(
  entry: ServerListEntry,
  installation: string,
): MCPServer | undefined {
  if (entry.row.kind === 'server') {
    return entry.row.server;
  }
  if (entry.row.kind === 'family') {
    return selectRepresentative(entry.row.servers, installation)?.server;
  }
  return undefined;
}

/** How the server was set up, and so how it is changed. */
function sourceLabel(server: MCPServer | undefined): string {
  if (!server) {
    return 'muster';
  }
  return isGitOpsManaged(server) ? 'Fleet server' : 'User-registered server';
}

function description(entry: ServerListEntry): string | undefined {
  switch (entry.row.kind) {
    case 'family':
      return 'Server family';
    case 'server':
      return entry.row.server.getUrl();
    default:
      return 'core tools';
  }
}

/** The Tools cell: a count, "3 of 42 match" while searching, or why neither. */
function toolsLabel(
  entry: ServerListEntry,
  catalogue: 'loaded' | 'loading' | 'unavailable',
): string {
  if (entry.toolCount === undefined) {
    return catalogue === 'loading' ? '…' : '—';
  }
  // Its tools are hidden until this person signs in, not absent.
  if (
    entry.toolCount === 0 &&
    entry.row.kind === 'server' &&
    entry.row.server.getState() === 'Auth Required' &&
    entry.row.server.canAuthenticateInteractively()
  ) {
    return 'Sign-in needed';
  }
  if (entry.toolMatches !== undefined && entry.toolMatches > 0) {
    return `${entry.toolMatches} of ${entry.toolCount} match`;
  }
  return String(entry.toolCount);
}

export interface ServersTableProps {
  entries: ServerListEntry[];
  installation: string;
  /** The list's search, carried to a tool-matched row's Tools tab. */
  query: string;
  catalogue: 'loaded' | 'loading' | 'unavailable';
  emptyText: string;
}

/**
 * The servers list: Server · Status · Tools · Auth · Source, one row per
 * server family, singular server and muster itself, in the order given
 * (sorted by name). A row's name opens its server page; a row that matched
 * the search by its tools opens on its Tools tab with the same filter.
 */
export function ServersTable({
  entries,
  installation,
  query,
  catalogue,
  emptyText,
}: ServersTableProps) {
  const links = useServerPageLinks();

  const columns: ColumnConfig<ServerListEntry>[] = [
    {
      id: 'server',
      label: 'Server',
      isRowHeader: true,
      // The name and its URL are what a person scans for; the other columns
      // hold a badge, a count or a short label each.
      defaultWidth: '4fr',
      minWidth: 280,
      cell: entry => (
        <CellText
          title={entry.id}
          description={description(entry)}
          href={links.server(entry.id, installation, {
            q: entry.toolMatches ? query.trim() : undefined,
          })}
        />
      ),
    },
    {
      id: 'status',
      label: 'Status',
      defaultWidth: '1.25fr',
      minWidth: 180,
      cell: entry => (
        <Cell>
          {entry.row.kind === 'server' && (
            <ServerStateBadge server={entry.row.server} />
          )}
          {entry.row.kind === 'family' && (
            <FamilyHealthBadge instances={entry.row.servers} />
          )}
          {entry.row.kind === 'core' && (
            <Text variant="body-small" color="secondary">
              —
            </Text>
          )}
        </Cell>
      ),
    },
    {
      id: 'tools',
      label: 'Tools',
      defaultWidth: '1fr',
      minWidth: 120,
      cell: entry => <CellText title={toolsLabel(entry, catalogue)} />,
    },
    {
      id: 'auth',
      label: 'Auth',
      defaultWidth: '1.75fr',
      minWidth: 200,
      cell: entry => {
        const server = configServer(entry, installation);
        return (
          <CellText
            title={
              server
                ? AUTH_MODE_LABELS[serverAuthMode(server)]
                : 'Muster session'
            }
          />
        );
      },
    },
    {
      id: 'source',
      label: 'Source',
      defaultWidth: '1fr',
      minWidth: 150,
      cell: entry => (
        <CellText title={sourceLabel(configServer(entry, installation))} />
      ),
    },
  ];

  const { tableProps } = useTable<ServerListEntry>({
    mode: 'complete',
    data: entries,
    paginationOptions: { type: 'none' },
  });

  if (entries.length === 0) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        {emptyText}
      </Text>
    );
  }
  return <Table<ServerListEntry> {...tableProps} columnConfig={columns} />;
}
