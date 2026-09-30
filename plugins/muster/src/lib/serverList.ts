import { ToolSummary } from '../apis';
import { MCPServer } from './k8s';
import {
  MUSTER_SERVER_KEY,
  ServerPageRow,
  partitionServers,
  serverRowKey,
} from './serverGrouping';
import {
  serverPrefixInfos,
  shortToolName,
  toolsByServerKey,
} from './toolGrouping';
import { toolMatchesQuery } from './toolSearch';

/** One row of the servers list. */
export interface ServerListEntry {
  /** The row's server page segment, and its name in the list. */
  id: string;
  row: ServerPageRow;
  /** How many tools the row offers; undefined until the catalogue is read. */
  toolCount?: number;
  /**
   * How many of the row's tools match a search the row's name does not;
   * undefined without such a search or without a catalogue.
   */
  toolMatches?: number;
}

/**
 * The servers list: one row per server family, per singular server and for
 * muster itself, sorted by name. With a query a row stays when its name
 * matches or one of its tools does (by the rule the Tools tab filters with);
 * without a catalogue -- no muster session -- only names are searched. A row
 * its name matches is a name match, whatever its tools say.
 */
export function serverListEntries(
  servers: MCPServer[],
  catalogue: ToolSummary[] | undefined,
  query: string,
): ServerListEntry[] {
  const q = query.trim().toLowerCase();
  const rows: ServerPageRow[] = [
    ...partitionServers(servers).flatMap(group => group.rows),
    { kind: 'core' },
  ];
  const prefixes = serverPrefixInfos(servers);
  const tools = catalogue
    ? toolsByServerKey(catalogue, prefixes, MUSTER_SERVER_KEY)
    : undefined;

  return rows
    .map(row => {
      const id = serverRowKey(row);
      const own = tools ? (tools.get(id) ?? []) : undefined;
      const nameMatch = !q || id.toLowerCase().includes(q);
      return {
        id,
        row,
        toolCount: own?.length,
        toolMatches:
          !nameMatch && own
            ? own.filter(tool =>
                toolMatchesQuery(tool, shortToolName(tool.name, prefixes), q),
              ).length
            : undefined,
        nameMatch,
      };
    })
    .filter(entry => entry.nameMatch || (entry.toolMatches ?? 0) > 0)
    .map(({ nameMatch: _nameMatch, ...entry }) => entry)
    .sort((a, b) => a.id.localeCompare(b.id));
}
