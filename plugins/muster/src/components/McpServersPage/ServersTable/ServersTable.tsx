import { CSSProperties, useMemo } from 'react';
import { Link } from '@backstage/core-components';
import {
  Badge,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  SortDescriptor,
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

/** One line, cut to the column with an ellipsis. */
const TRUNCATE: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

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

/** Whether the tool catalogue was read, is being read, failed, or needs a session. */
export type CatalogueState = 'loaded' | 'loading' | 'failed' | 'unavailable';

/** A server whose tools stay hidden until this person signs in to it. */
function awaitsSignIn(server: MCPServer): boolean {
  return (
    server.getState() === 'Auth Required' &&
    server.canAuthenticateInteractively()
  );
}

/** The Tools cell: a count, "3 of 42 match" while searching, or why neither. */
function toolsLabel(entry: ServerListEntry, catalogue: CatalogueState): string {
  if (entry.toolCount === undefined) {
    return catalogue === 'loading' ? '…' : '—';
  }
  // Its tools are hidden until this person signs in, not absent -- for a
  // family, when every instance waits on a sign-in.
  const instances = entry.row.kind === 'server' ? [entry.row.server] : [];
  if (entry.row.kind === 'family') {
    instances.push(...entry.row.servers);
  }
  if (
    entry.toolCount === 0 &&
    instances.length > 0 &&
    instances.every(awaitsSignIn)
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
  catalogue: CatalogueState;
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
  /** The row's unique list key, the table's row id. */
  id: string;
  /** The server's name, what the Server column shows and sorts by. */
  name: string;
  entry: ServerListEntry;
  status: string;
  tools: string;
  /** The count a Tools sort orders by; undefined (no count) sorts last. */
  toolsRank?: number;
  auth: string;
  source: string;
}

type SortKey = keyof Omit<ServerTableRow, 'id' | 'entry'>;

/** Which row value each column sorts by. */
const SORT_KEYS: Record<string, SortKey> = {
  server: 'name',
  status: 'status',
  tools: 'toolsRank',
  auth: 'auth',
  source: 'source',
};

function sortServerRows(
  rows: ServerTableRow[],
  sort: SortDescriptor,
): ServerTableRow[] {
  const key = SORT_KEYS[String(sort.column)] ?? 'name';
  const sign = sort.direction === 'descending' ? -1 : 1;
  const compare = (a: ServerTableRow, b: ServerTableRow) => {
    const x = a[key];
    const y = b[key];
    // No value -- muster's "—" status, a row without a tool count -- is not a
    // value to order by: last whichever way the column is sorted.
    const missing = (v: unknown) => v === undefined || v === '—';
    if (missing(x) !== missing(y)) {
      return missing(x) ? 1 : -1;
    }
    // Text as it reads, numbers by value: "3 of 5 instances healthy" sorts
    // before "12 of 12 instances healthy", and equal statuses sit together.
    const primary =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true });
    // Ties stay in name order whichever way the column is sorted.
    return (
      primary * sign || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    );
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
          // Unique per row: a family and a singular server may share a name.
          id: entry.key,
          name: entry.id,
          entry,
          status: statusLabel(entry),
          tools,
          toolsRank: /^\d/.test(tools)
            ? entry.toolMatches || entry.toolCount
            : undefined,
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
      // The name is what a person scans for; the other columns hold a state,
      // a count or a short label each.
      defaultWidth: '4fr',
      minWidth: 280,
      cell: row => {
        const { entry } = row;
        const href = entry.shadowed
          ? undefined
          : links.server(entry.id, installation, {
              q: entry.toolMatches ? query.trim() : undefined,
            });
        // core-components' `Link`, as the Sessions table's title: the target
        // is a route ref's path (`links.server`), and it reads as a link, in
        // the link colour -- bui's Link takes the body colour, underlined.
        return (
          <Cell>
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              {href ? (
                <Link to={href} title={entry.id} style={TRUNCATE}>
                  {entry.id}
                </Link>
              ) : (
                <Text
                  variant="body-medium"
                  truncate
                  title={
                    entry.shadowed
                      ? `A server family (or muster) of the same name takes the page “${entry.id}”, so this server has none of its own.`
                      : entry.id
                  }
                >
                  {entry.id}
                </Text>
              )}
              {entry.row.kind === 'family' && (
                <Badge size="small" style={{ flexShrink: 0 }}>
                  Family
                </Badge>
              )}
              {entry.row.kind === 'core' && (
                <Badge size="small" style={{ flexShrink: 0 }}>
                  Core
                </Badge>
              )}
            </Flex>
          </Cell>
        );
      },
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
