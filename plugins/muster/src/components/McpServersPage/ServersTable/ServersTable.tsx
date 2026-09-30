import { useMemo } from 'react';
import {
  CellText,
  ColumnConfig,
  SortDescriptor,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { isGitOpsManaged } from '../../../lib/gitops';
import {
  MCPServer,
  MCPServerSeverity,
  mcpServerStateSeverity,
  worstSeverity,
} from '../../../lib/k8s';
import { selectRepresentative } from '../../../lib/serverGrouping';
import { ServerListEntry } from '../../../lib/serverList';
import { AUTH_MODE_LABELS, serverAuthMode } from '../../../lib/serverAuthMode';
import {
  familyHealthLabel,
  serverStateLabel,
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

/** The Status cell, as plain text like the other columns. */
function statusLabel(entry: ServerListEntry): string {
  switch (entry.row.kind) {
    case 'server':
      return serverStateLabel(entry.row.server);
    case 'family':
      return familyHealthLabel(entry.row.servers);
    default:
      return '—';
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
 * server family, singular server and muster itself, sorted by name and by any
 * column on a header click. A row's name opens its server page; a row that matched
 * the search by its tools opens on its Tools tab with the same filter.
 */
/** A list entry with what its cells show, worked out once for rendering and sorting. */
interface ServerTableRow {
  id: string;
  entry: ServerListEntry;
  status: string;
  /** Lower is worse: failing first when sorted ascending. */
  statusRank: number;
  tools: string;
  /** The count a Tools sort orders by; rows without one sort last. */
  toolsRank: number;
  auth: string;
  source: string;
}

const SEVERITY_RANK: Record<MCPServerSeverity, number> = {
  error: 0,
  warning: 1,
  unknown: 2,
  ok: 3,
};

/** The row's worst health, for sorting; muster itself sorts after every server. */
function statusRank(entry: ServerListEntry): number {
  const instances =
    entry.row.kind === 'server'
      ? [entry.row.server]
      : entry.row.kind === 'family'
        ? entry.row.servers
        : [];
  if (instances.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  const worst = instances
    .map(s => mcpServerStateSeverity(s.getState()))
    .reduce<MCPServerSeverity>(worstSeverity, 'ok');
  return SEVERITY_RANK[worst];
}

type SortKey = keyof Omit<ServerTableRow, 'id' | 'entry'>;

/** Which row value each column sorts by. */
const SORT_KEYS: Record<string, SortKey | 'id'> = {
  server: 'id',
  status: 'statusRank',
  tools: 'toolsRank',
  auth: 'auth',
  source: 'source',
};

function sortServerRows(
  rows: ServerTableRow[],
  sort: SortDescriptor,
): ServerTableRow[] {
  const key = SORT_KEYS[String(sort.column)] ?? 'id';
  const sign = sort.direction === 'descending' ? -1 : 1;
  const compare = (a: ServerTableRow, b: ServerTableRow) => {
    const x = a[key];
    const y = b[key];
    const primary =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y));
    // Ties stay in name order whichever way the column is sorted.
    return primary * sign || a.id.localeCompare(b.id);
  };
  return [...rows].sort(compare);
}

export function ServersTable({
  entries,
  installation,
  query,
  catalogue,
  emptyText,
}: ServersTableProps) {
  const links = useServerPageLinks();

  const rows = useMemo<ServerTableRow[]>(
    () =>
      entries.map(entry => {
        const server = configServer(entry, installation);
        const tools = toolsLabel(entry, catalogue);
        return {
          id: entry.id,
          entry,
          status: statusLabel(entry),
          statusRank: statusRank(entry),
          tools,
          toolsRank:
            entry.toolCount === undefined || !/^\d/.test(tools)
              ? -1
              : entry.toolMatches || entry.toolCount,
          auth: server
            ? AUTH_MODE_LABELS[serverAuthMode(server)]
            : 'Muster session',
          source: sourceLabel(server),
        };
      }),
    [entries, installation, catalogue],
  );

  const columns: ColumnConfig<ServerTableRow>[] = [
    {
      id: 'server',
      label: 'Server',
      isRowHeader: true,
      isSortable: true,
      // The name and its URL are what a person scans for; the other columns
      // hold a state, a count or a short label each.
      defaultWidth: '4fr',
      minWidth: 280,
      cell: row => (
        <CellText
          title={row.id}
          description={description(row.entry)}
          href={links.server(row.id, installation, {
            q: row.entry.toolMatches ? query.trim() : undefined,
          })}
        />
      ),
    },
    {
      id: 'status',
      label: 'Status',
      isSortable: true,
      defaultWidth: '1.25fr',
      minWidth: 180,
      cell: row => <CellText title={row.status} />,
    },
    {
      id: 'tools',
      label: 'Tools',
      isSortable: true,
      defaultWidth: '1fr',
      minWidth: 120,
      cell: row => <CellText title={row.tools} />,
    },
    {
      id: 'auth',
      label: 'Auth',
      isSortable: true,
      defaultWidth: '1.75fr',
      minWidth: 200,
      cell: row => <CellText title={row.auth} />,
    },
    {
      id: 'source',
      label: 'Source',
      isSortable: true,
      defaultWidth: '1fr',
      minWidth: 150,
      cell: row => <CellText title={row.source} />,
    },
  ];

  const { tableProps } = useTable<ServerTableRow>({
    mode: 'complete',
    data: rows,
    // Without a sortFn a complete table's sorting does nothing at all.
    sortFn: sortServerRows,
    initialSort: { column: 'server', direction: 'ascending' },
    paginationOptions: { type: 'none' },
  });

  if (entries.length === 0) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        {emptyText}
      </Text>
    );
  }
  // `tableProps` carries the sorted rows; never pass `data` after it.
  return <Table<ServerTableRow> {...tableProps} columnConfig={columns} />;
}
