import { ToolSummary } from '../apis';
import { MCPServer } from './k8s';
import {
  MUSTER_SERVER_KEY,
  ServerPageRow,
  partitionServers,
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
  /** The row's server page segment, and its name in the list. */
  id: string;
  row: ServerPageRow;
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
 * The servers list's rows: one per server family, per singular server and
 * for muster itself, each with its tools from the catalogue. The expensive
 * half of the list -- every tool attributed to its row once -- so it is worked
 * out per catalogue read, not per keystroke of a search.
 */
export function serverListRows(
  servers: MCPServer[],
  catalogue: ToolSummary[] | undefined,
): ServerListRow[] {
  const rows: ServerPageRow[] = [
    ...partitionServers(servers).flatMap(group => group.rows),
    { kind: 'core' },
  ];
  const families = new Set(
    servers.map(s => s.getFamily()).filter((f): f is string => Boolean(f)),
  );
  const prefixes = serverPrefixInfos(servers);
  const tools = catalogue ? toolsByServerKey(catalogue, prefixes) : undefined;

  return rows.map(row => {
    const id = serverRowKey(row);
    const key = serverListKey(row);
    return {
      key,
      id,
      row,
      tools: tools
        ? (tools.get(key) ?? []).map(tool => ({
            tool,
            shortName: shortToolName(tool.name, prefixes),
          }))
        : undefined,
      shadowed:
        row.kind === 'server' && (families.has(id) || id === MUSTER_SERVER_KEY),
    };
  });
}

/**
 * The servers list for a search, sorted by name. A row stays when its name
 * matches or one of its tools does (by the rule the Tools tab filters with);
 * without a catalogue -- no muster session -- only names are searched. A row
 * its name matches is a name match, whatever its tools say.
 */
export function serverListEntries(
  rows: ServerListRow[],
  query: string,
): ServerListEntry[] {
  const q = query.trim().toLowerCase();
  return rows
    .map(({ tools, ...row }) => {
      const nameMatch = !q || row.id.toLowerCase().includes(q);
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
    .sort((a, b) => a.id.localeCompare(b.id) || a.key.localeCompare(b.key));
}
