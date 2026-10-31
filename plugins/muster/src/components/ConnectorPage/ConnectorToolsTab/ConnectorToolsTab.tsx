import { MouseEvent, ReactNode, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Flex, SearchField, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  CatalogFilterBar,
  type CatalogFacet,
  type CatalogFilterSelection,
  CatalogNoMatch,
  INITIAL_ROWS,
  LoadingIndicator,
  isSearchableList,
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
import {
  EffectBadge,
  TruncatedListNote,
  type ToolsListView,
  useServerPageLinks,
} from '../../shared';
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

/**
 * Where the connector page's history entry keeps the Tools view a tool was
 * opened from (`location.state`), so Back from the tool lands on it again.
 */
const TOOLS_VIEW_STATE = 'toolsView';

/** What the history entry keeps: the search, the filter and the tool opened. */
type SavedToolsView = { q: string; effect: string[]; opened?: string };

function savedToolsView(state: unknown): SavedToolsView | undefined {
  const saved = (state as Record<string, unknown> | null)?.[TOOLS_VIEW_STATE];
  if (!saved || typeof saved !== 'object') {
    return undefined;
  }
  const { q, effect, opened } = saved as Partial<SavedToolsView>;
  return {
    q: typeof q === 'string' ? q : '',
    effect: Array.isArray(effect) ? effect.map(String) : [],
    ...(typeof opened === 'string' ? { opened } : {}),
  };
}

/** The Tools tab's search: what is typed, and how the tab opened. */
export type ToolSearchState = {
  query: string;
  setQuery: (query: string) => void;
  /**
   * A search the tab opened with keeps its field, short list or not, so it
   * can be read and cleared; clearing it does not take the field away.
   */
  openedSearched: boolean;
  /** The "What it does" picks the tab opened with. */
  initialSelection: CatalogFilterSelection;
  /** The tool last opened from this list, which the list shows again. */
  opened?: string;
};

/**
 * The Tools tab's search and filter, seeded once and not written back to the
 * address: every change of the address is a page view. Back from a tool's
 * page seeds them from the history entry (`location.state`), which the tab
 * writes when a tool is opened; otherwise the page's `?q=` and `?effect=`
 * seed them, as a link from Customize's search or a tool page's way back
 * carries them. The connector page holds the search above its tabs, so what
 * was typed is still there after a visit to another tab.
 */
export function useToolSearchState(): ToolSearchState {
  const { search, state } = useLocation();
  const [seed] = useState<SavedToolsView>(() => {
    const saved = savedToolsView(state);
    if (saved) {
      return saved;
    }
    const params = new URLSearchParams(search);
    return {
      q: params.get('q') ?? '',
      effect: (params.get('effect') ?? '').split(',').filter(Boolean),
    };
  });
  const [query, setQuery] = useState(seed.q);
  return {
    query,
    setQuery,
    openedSearched: seed.q.trim() !== '',
    initialSelection: seed.effect.length > 0 ? { effect: seed.effect } : {},
    ...(seed.opened ? { opened: seed.opened } : {}),
  };
}

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
  /**
   * The search, held by the page so it outlives the tab; without it the tab
   * holds its own, seeded the same way.
   */
  searchState?: ToolSearchState;
}

/**
 * The connector's tools as a list of links, one row per tool: its name, its
 * description cut to two lines and what it does. Each row opens the tool's own
 * page, which holds its schema, the form that runs it and the result. A search
 * and a "What it does" dropdown (only when the tools both read and change
 * things) with a count per choice sit above a long list. A short list
 * (under `SEARCH_MIN`) is read, not searched, so it shows neither, unless
 * the tab opened with a search; a long one renders a page of tools at a time.
 * The search and filter are seeded once (`useToolSearchState`): from the
 * page's `?q=`, as the Customize list's search links a connector it matched by
 * its tools, so the tab opens on the matching tools. A tool's link carries the
 * search and filter in force for its page's way back, and opening a tool
 * keeps them and the tool in this page's history entry, so Back lands on the
 * same tools with the opened one shown.
 */
export function ConnectorToolsTab({
  server,
  installation,
  tools,
  emptyExplanation,
  sessionGate,
  signInGate,
  searchState,
}: ConnectorToolsTabProps) {
  const classes = useStyles();
  const ownSearch = useToolSearchState();
  const { query, setQuery, openedSearched, initialSelection, opened } =
    searchState ?? ownSearch;
  const links = useServerPageLinks();
  const location = useLocation();
  const navigate = useNavigate();

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
    initialSelection,
  });
  const shown = filters.filtered;
  const view: ToolsListView = {
    q: query.trim() || undefined,
    effect: filters.selection.effect?.length
      ? filters.selection.effect
      : undefined,
  };
  const hrefOf = (tool: ToolSummary) =>
    links.tool(server, tool.name, installation, view);
  // The list as the tab opened on it: it pages far enough to show the tool
  // last opened from it again, until the search or filter changes.
  const [openedKey] = useState(() => `${filters.key}|${query}`);
  const listKey = `${filters.key}|${query}`;
  const openedIndex =
    opened && listKey === openedKey
      ? shown.findIndex(tool => tool.name === opened)
      : -1;
  const initialShown =
    openedIndex >= 0
      ? Math.ceil((openedIndex + 1) / INITIAL_ROWS) * INITIAL_ROWS
      : undefined;

  // Before a row's link navigates (capture runs first), the view and the
  // tool go into this entry's state: no page view, as the address stays.
  const rememberOpened = (event: MouseEvent<HTMLElement>) => {
    const href = (event.target as Element)
      .closest('a[href]')
      ?.getAttribute('href');
    const tool = href ? shown.find(t => hrefOf(t) === href) : undefined;
    if (!tool) {
      return;
    }
    const saved: SavedToolsView = {
      q: query,
      effect: [...(filters.selection.effect ?? [])],
      opened: tool.name,
    };
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: {
          ...((location.state as object | null) ?? {}),
          [TOOLS_VIEW_STATE]: saved,
        },
      },
    );
  };
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

  // A tool or two is read at a glance; kept while a search is in force.
  const searchable = isSearchableList(
    all.length,
    openedSearched || query.trim() !== '',
  );

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
        <div onClickCapture={rememberOpened}>
          <ShowMore
            key={listKey}
            items={shown}
            initial={INITIAL_ROWS}
            initialShown={initialShown}
            noun="tool"
          >
            {page => (
              <StackedRowList
                aria-label="Tools"
                rows={page.map(tool => ({
                  id: tool.name,
                  title: shortName(tool.name),
                  href: hrefOf(tool),
                  status: <EffectBadge effect={toolEffect(tool)} />,
                  description: tool.description ?? tool.summary,
                }))}
              />
            )}
          </ShowMore>
        </div>
      )}
    </Flex>
  );
}
