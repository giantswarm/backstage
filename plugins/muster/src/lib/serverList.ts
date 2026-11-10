import { ToolSummary } from '../apis';
import { MCPServer } from './k8s';
import { rowTags } from './connectorTags';
import {
  MUSTER_SERVER_KEY,
  ServerPageRow,
  mcpServerDisplayNames,
  partitionServers,
  serverRowDisplayName,
  serverRowKey,
} from './serverGrouping';
import {
  serverListKey,
  serverPrefixInfos,
  shortToolName,
  toolsByServerKey,
} from './toolGrouping';
import { toolMatchesQuery } from './toolSearch';

/** A tool with the name its server's page shows it by. */
export interface NamedTool {
  tool: ToolSummary;
  shortName: string;
}

/** One row of the servers list, before any search. */
export interface ServerListRow {
  /** Unique within the list: `family:<name>`, `server:<name>` or `core`. */
  key: string;
  /** The row's server page segment: the name its page, links and muster use. */
  id: string;
  /**
   * The row's name in the list: its `ui.giantswarm.io/display-name`, else
   * {@link id}.
   */
  displayName: string;
  row: ServerPageRow;
  /**
   * The row's tags (`rowTags`): the one its tool-group label reads as, then
   * a server's own or every tag of a family's members; muster's is
   * `agent-platform`.
   */
  tags: string[];
  /** The row's tools; undefined until the catalogue is read. */
  tools?: NamedTool[];
  /**
   * A singular server whose page segment a family of the same name (or
   * muster, for one named `muster`) takes: its page cannot be opened.
   */
  shadowed: boolean;
}

/** One row of the servers list, as a search leaves it. */
export interface ServerListEntry extends Omit<ServerListRow, 'tools'> {
  /** How many tools the row offers; undefined until the catalogue is read. */
  toolCount?: number;
  /**
   * How many of the row's tools match a search the row's name does not;
   * undefined without such a search or without a catalogue.
   */
  toolMatches?: number;
}

/**
 * The rows the servers list shows, before any tools: one per server family,
 * per singular server and for muster itself. What the list and its counts
 * share.
 */
export function serverPageRows(servers: MCPServer[]): ServerPageRow[] {
  return [
    ...partitionServers(servers).flatMap(group => group.rows),
    { kind: 'core' },
  ];
}

/**
 * The servers list's rows: one per server family, per singular server and
 * for muster itself, each with its tools from the catalogue. The expensive
 * half of the list -- every tool attributed to its row once -- so it is worked
 * out per catalogue read, not per keystroke of a search.
 */
export function serverListRows(
  servers: MCPServer[],
  catalogue: ToolSummary[] | undefined,
): ServerListRow[] {
  const rows = serverPageRows(servers);
  const families = new Set(
    servers.map(s => s.getFamily()).filter((f): f is string => Boolean(f)),
  );
  const prefixes = serverPrefixInfos(servers);
  const names = mcpServerDisplayNames(servers);
  const tools = catalogue ? toolsByServerKey(catalogue, prefixes) : undefined;

  return rows.map(row => {
    const id = serverRowKey(row);
    const key = serverListKey(row);
    const shadowed =
      row.kind === 'server' && (families.has(id) || id === MUSTER_SERVER_KEY);
    return {
      key,
      id,
      // A shadowed server's name is its family's (or muster's) page; its row
      // keeps its own name so the two read apart.
      displayName: shadowed ? id : serverRowDisplayName(row, names),
      row,
      tags: rowTags(row),
      tools: tools
        ? (tools.get(key) ?? []).map(tool => ({
            tool,
            shortName: shortToolName(tool.name, prefixes),
          }))
        : undefined,
      shadowed,
    };
  });
}

const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

/**
 * Compares text the way a person reads a list: case-insensitive, so
 * "Muster" sorts with "muster", and digits by their value, so `connector-2`
 * comes before `connector-10`.
 */
export function compareListText(a: string, b: string): number {
  return nameCollator.compare(a, b);
}

/**
 * The servers list's order: by the name a row shows, then by the name its
 * page uses, then by its key, so a shadowed server and the family (or
 * muster) of the same name still take a fixed order. Never 0 for two rows
 * of one list.
 */
export function compareServerListNames(
  a: Pick<ServerListRow, 'displayName' | 'id' | 'key'>,
  b: Pick<ServerListRow, 'displayName' | 'id' | 'key'>,
): number {
  return (
    compareListText(a.displayName, b.displayName) ||
    compareListText(a.id, b.id) ||
    // Only case tells these apart: still a fixed order.
    a.id.localeCompare(b.id) ||
    a.key.localeCompare(b.key)
  );
}

/**
 * The servers list for a search, sorted by the name it shows
 * ({@link compareServerListNames}). A row stays
 * when its name -- the display name or the one its page uses -- or one of its
 * tags matches, or one of its tools does (by the rule the Tools tab filters with);
 * without a catalogue -- no muster session -- only names and tags are
 * searched. A row its name or a tag matches is a name match, whatever its
 * tools say.
 */
export function serverListEntries(
  rows: ServerListRow[],
  query: string,
): ServerListEntry[] {
  const q = query.trim().toLowerCase();
  return rows
    .map(({ tools, ...row }) => {
      const nameMatch =
        !q ||
        row.id.toLowerCase().includes(q) ||
        row.displayName.toLowerCase().includes(q) ||
        row.tags.some(tag => tag.includes(q));
      return {
        ...row,
        toolCount: tools?.length,
        toolMatches:
          !nameMatch && tools
            ? tools.filter(t => toolMatchesQuery(t.tool, t.shortName, q)).length
            : undefined,
        nameMatch,
      };
    })
    .filter(entry => entry.nameMatch || (entry.toolMatches ?? 0) > 0)
    .map(({ nameMatch: _nameMatch, ...entry }) => entry)
    .sort(compareServerListNames);
}
