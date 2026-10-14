import { ReactNode, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Box, Flex, SearchField, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  CatalogFilterBar,
  type CatalogFacet,
  CatalogNoMatch,
  INITIAL_ROWS,
  LoadingIndicator,
  SEARCH_MIN,
  ShowMore,
  StackedRowList,
  useCatalogFilters,
} from '@giantswarm/backstage-plugin-ui-react';
import { ToolSummary } from '../../../apis';
import {
  TOOL_EFFECT_LABELS,
  toolEffect,
  ToolEffect,
} from '../../../lib/toolAnnotations';
import { toolMatchesQuery } from '../../../lib/toolSearch';
import { EffectBadge, TruncatedListNote, useServerPageLinks } from '../../shared';
import { ServerTools } from '../../ServerPage/useServerPageData';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 8,
  },
  // A width cap, as the Resources and Prompts tabs' search has. The toolbar
  // is a column, so a flex basis here set the field's height: a tall empty
  // band between the search and the filter.
  search: {
    maxWidth: 360,
  },
  // Two lines of a tool's description, then its page: some run to pages.
  description: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    overflowWrap: 'anywhere',
  },
});

/** The "What it does" dropdown, as the wizard's catalogue draws it (T81). */
const EFFECT_FACETS: readonly CatalogFacet<ToolSummary>[] = [
  {
    id: 'effect',
    label: 'What it does',
    value: tool => toolEffect(tool),
    optionLabel: id => TOOL_EFFECT_LABELS[id as ToolEffect] ?? id,
    order: ['reads', 'changes'],
  },
];

export interface ConnectorToolsTabProps {
  /** The connector's key in the address, which its tools' pages sit under. */
  server: string;
  installation: string;
  tools: ServerTools;
  /** Why the connector lists no tools, when it lists none. */
  emptyExplanation: string;
  /** Shown instead of the list while the muster session is missing. */
  sessionGate?: ReactNode;
  /**
   * Shown instead of an empty list when this person's session is not signed
   * in to the server, which hides its tools.
   */
  signInGate?: ReactNode;
}

/**
 * The connector's tools as a list of links, one row per tool: its name, its
 * description cut to two lines and what it does. Each row opens the tool's own
 * page, which holds its schema, the form that runs it and the result. A search
 * and a "What it does" dropdown (only when the tools both read and change
 * things) with a count per choice sit above a long list. A short list
 * (`SEARCH_MIN` or fewer) is read, not searched, so it shows neither, unless
 * the tab opened with a search; a long one renders a page of tools at a time.
 * The search is seeded once from the page's `?q=`: the Customize list's search
 * links a connector it matched by its tools here with it, so the tab opens on
 * the matching tools. A tool's link carries the search in force, so the way
 * back from its page lands on the same tools.
 */
export function ConnectorToolsTab({
  server,
  installation,
  tools,
  emptyExplanation,
  sessionGate,
  signInGate,
}: ConnectorToolsTabProps) {
  const classes = useStyles();
  const { search } = useLocation();
  // Seeded once from `?q=`, as Customize's search is, and not written back:
  // every change of the address is a page view.
  const [initialQuery] = useState(
    () => new URLSearchParams(search).get('q') ?? '',
  );
  const [query, setQuery] = useState(initialQuery);
  // A search the tab opened with keeps its field, short list or not, so it
  // can be read and cleared; clearing it does not take the field away.
  const openedSearched = initialQuery.trim() !== '';
  const links = useServerPageLinks();

  const { tools: listed, shortName } = tools;
  const all = useMemo(() => listed ?? [], [listed]);
  const searched = useMemo(
    () =>
      all.filter(tool => toolMatchesQuery(tool, shortName(tool.name), query)),
    [all, query, shortName],
  );
  const filters = useCatalogFilters({
    items: all,
    searched,
    facets: EFFECT_FACETS,
  });
  const shown = filters.filtered;
  // A list of one kind has nothing to tell apart; a pick still standing stays
  // drawn so it can be undone.
  const effectDimensions = filters.dimensions.filter(
    dimension => dimension.options.length > 1 || dimension.selected.length > 0,
  );

  if (sessionGate) {
    return <>{sessionGate}</>;
  }
  if (tools.isLoading) {
    return <LoadingIndicator label="Reading the connector's tools…" />;
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
  if (all.length === 0) {
    return signInGate ? (
      <>{signInGate}</>
    ) : (
      <Text as="p" variant="body-medium" color="secondary">
        {emptyExplanation}
      </Text>
    );
  }

  // Three tools are read at a glance; a search and a filter over them is
  // volume framing, unless a search is already in force.
  const searchable =
    all.length > SEARCH_MIN || openedSearched || query.trim() !== '';

  return (
    <Flex direction="column" gap="0">
      {searchable && (
        <div className={classes.toolbar}>
          <Box className={classes.search}>
            <SearchField
              aria-label="Search tools"
              placeholder={`Search ${all.length} tools`}
              size="small"
              value={query}
              onChange={setQuery}
            />
          </Box>
          <CatalogFilterBar
            dimensions={effectDimensions}
            onSelect={filters.select}
            onClear={filters.clear}
          />
        </div>
      )}
      <TruncatedListNote plural="tools" truncated={tools.truncated} />
      {shown.length === 0 ? (
        <CatalogNoMatch
          plural="tools"
          search={query}
          isFiltered={filters.isFiltered}
          onClearFilters={filters.clear}
        />
      ) : (
        // A server can list hundreds of tools; a page of them at a time,
        // starting over when the search or filter changes.
        <ShowMore
          key={`${filters.key}|${query}`}
          items={shown}
          initial={INITIAL_ROWS}
          noun="tool"
        >
          {page => (
            <StackedRowList
              aria-label="Tools"
              rows={page.map(tool => {
                const description = tool.description ?? tool.summary;
                return {
                  id: tool.name,
                  title: shortName(tool.name),
                  href: links.tool(server, tool.name, installation, {
                    q: query.trim() || undefined,
                  }),
                  status: <EffectBadge effect={toolEffect(tool)} />,
                  details: description ? (
                    <Text
                      as="p"
                      variant="body-small"
                      color="secondary"
                      className={classes.description}
                    >
                      {description}
                    </Text>
                  ) : undefined,
                };
              })}
            />
          )}
        </ShowMore>
      )}
    </Flex>
  );
}
