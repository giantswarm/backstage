import { ReactNode, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Flex, SearchField, Table, Text, useTable } from '@backstage/ui';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';
import { ServerPageRow } from '../../../lib/serverGrouping';
import { toolMatchesQuery } from '../../../lib/toolSearch';
import { noToolsExplanation } from '../../McpServersPage/serverDetail';
import { hasMarkers, useServerPageLinks } from '../../shared';
import { ServerTools } from '../useServerPageData';
import { sortToolRows, toolColumns, ToolRow } from './columns';

export interface ServerToolsTabProps {
  row: ServerPageRow;
  serverKey: string;
  installation: string;
  tools: ServerTools;
  /** Shown instead of the table while the muster session is missing. */
  sessionGate?: ReactNode;
  /**
   * Shown instead of an empty table when this person's session is not signed
   * in to the server, which hides its tools.
   */
  signInGate?: ReactNode;
}

/** Why a row lists no tools, when it is not a missing sign-in. */
function emptyExplanation(row: ServerPageRow): string {
  if (row.kind === 'server') {
    return noToolsExplanation(row.server);
  }
  if (row.kind === 'family') {
    return 'No tools exposed by any instance of this family. An instance that needs a sign-in offers it on the Instances tab.';
  }
  return 'muster reports no tools of its own.';
}

/** The filter's rule, the one the servers list counts its tool matches by. */
function searchToolRows(rows: ToolRow[], query: string): ToolRow[] {
  return rows.filter(row =>
    toolMatchesQuery(
      { name: row.id, description: row.description },
      row.name,
      query,
    ),
  );
}

/**
 * The server's tools, each linking to its tool page: short name, the
 * read-only / destructive markers, and description, sortable by each and
 * paged. The filter is the page's `?q=`, so a link can open the tab
 * pre-filtered. A family's tools are listed once for the whole family,
 * including the ones muster exposes per instance.
 */
export function ServerToolsTab({
  row,
  serverKey,
  installation,
  tools,
  sessionGate,
  signInGate,
}: ServerToolsTabProps) {
  const links = useServerPageLinks();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const setQuery = useCallback(
    (next: string) =>
      setSearchParams(
        prev => {
          if (next) {
            prev.set('q', next);
          } else {
            prev.delete('q');
          }
          return prev;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const { tools: listed, shortName } = tools;
  const rows = useMemo<ToolRow[]>(
    () =>
      (listed ?? []).map(tool => ({
        id: tool.name,
        name: shortName(tool.name),
        href: links.tool(serverKey, tool.name, installation),
        annotations: tool.annotations,
        // muster's catalogue carries a one-line `summary`; the full
        // description only where an older aggregator still sends it.
        description: tool.description ?? tool.summary,
      })),
    [listed, shortName, links, serverKey, installation],
  );

  // From every tool, not the filtered ones, so the column stays put while
  // the filter narrows the rows.
  const columns = useMemo(
    () =>
      toolColumns({
        annotations: (listed ?? []).some(tool => hasMarkers(tool.annotations)),
      }),
    [listed],
  );

  const { tableProps } = useTable<ToolRow>({
    mode: 'complete',
    data: rows,
    // Without a sortFn a complete table's sorting does nothing at all.
    sortFn: sortToolRows,
    initialSort: { column: 'tool', direction: 'ascending' },
    // The table's search is the URL's `?q=`: a changed filter goes back to
    // the first page.
    search: query,
    onSearchChange: setQuery,
    searchFn: searchToolRows,
    // As the Sessions table pages.
    paginationOptions: { pageSize: 25, pageSizeOptions: [25, 50, 100] },
  });

  if (sessionGate) {
    return <>{sessionGate}</>;
  }
  if (tools.isLoading) {
    return <LoadingIndicator label="Reading the server's tools…" />;
  }
  if (tools.error) {
    return (
      <Alert
        status="danger"
        title="Could not read the tools"
        description={tools.error.message}
      />
    );
  }

  const all = tools.tools ?? [];
  if (all.length === 0) {
    return signInGate ? (
      <>{signInGate}</>
    ) : (
      <Text as="p" variant="body-medium" color="secondary">
        {emptyExplanation(row)}
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="3">
      <SearchField
        aria-label="Filter tools"
        placeholder="Filter tools"
        value={query}
        onChange={setQuery}
        style={{ maxWidth: 480 }}
      />
      {tools.truncated && (
        <Text as="p" variant="body-small" color="secondary">
          The installation offers more tools than one request returns; this list
          may be incomplete.
        </Text>
      )}
      {/* `tableProps` carries the sorted rows; never pass `data` after it. */}
      <Table<ToolRow>
        {...tableProps}
        columnConfig={columns}
        emptyState={
          <Text as="p" variant="body-medium" color="secondary">
            No tool of this server matches “{query}”.
          </Text>
        }
      />
    </Flex>
  );
}
