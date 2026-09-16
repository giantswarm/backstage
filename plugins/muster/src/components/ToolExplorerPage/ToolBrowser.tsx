import { useEffect, useMemo, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Badge,
  Box,
  Button,
  ButtonIcon,
  Flex,
  SearchField,
  Text,
} from '@backstage/ui';
import { ToolTable, toolTableItem, type ToolTableItem } from '../shared';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef, ToolSummary } from '../../apis';
import {
  groupTools,
  ServerPrefixInfo,
  ToolGroup,
  toolsForServer,
} from '../../lib/toolGrouping';
import { ExplorerError } from './ExplorerError';
import { BrowserSkeleton } from './states';
import { ToolPrefs } from './useToolPrefs';

/** No-pattern page size used to pull the whole catalogue for browsing. */
const BROWSE_LIMIT = 2000;
/** Page size for ranked search results. */
const SEARCH_LIMIT = 50;

const useStyles = makeStyles(() => ({
  panel: {
    maxHeight: 360,
    overflow: 'auto',
  },
  kbd: {
    fontFamily: 'monospace',
  },
}));

/**
 * One browse or search result: the whole row opens the tool, the favourite star
 * stays a control of its own at the trailing edge (a button cannot nest inside
 * a button), and a query-ranked result carries its score beside the markers.
 */
function browserItem(
  tool: ToolSummary,
  {
    selected,
    active,
    favourite,
    onSelect,
    onToggleFavourite,
  }: {
    selected: boolean;
    active?: boolean;
    favourite: boolean;
    onSelect: (name: string) => void;
    onToggleFavourite: (name: string) => void;
  },
): ToolTableItem {
  return toolTableItem(tool, {
    mode: {
      kind: 'action',
      onSelect: () => onSelect(tool.name),
      selected,
      active,
    },
    meta:
      tool.score !== undefined ? (
        <Badge size="small">score {tool.score}</Badge>
      ) : undefined,
    trailing: (
      <ButtonIcon
        variant="tertiary"
        size="small"
        aria-label={favourite ? 'Remove favourite' : 'Add favourite'}
        icon={
          favourite ? (
            <StarIcon fontSize="small" color="primary" />
          ) : (
            <StarBorderIcon fontSize="small" />
          )
        }
        onClick={() => onToggleFavourite(tool.name)}
      />
    ),
  });
}

export interface ToolBrowserProps {
  installation?: string;
  selected?: string;
  onSelect: (name: string) => void;
  /** MCPServer-derived prefixes, used to group server tools by management cluster. */
  servers: ServerPrefixInfo[];
  prefs: ToolPrefs;
  /**
   * Server CR name from a `?server=` deep link: scopes the browse to that
   * server's tools (prefix filter) instead of seeding a free-text search.
   */
  serverScope?: string;
  /**
   * Whether the MCPServer CRs are still loading. The browse grouping depends on
   * them, so hold the skeleton until they resolve to avoid reshuffling sections
   * from raw `Server: <segment>` buckets to MC/fleet buckets on load (F2).
   */
  serversLoading?: boolean;
}

/**
 * Left-hand browse/search panel. With an empty query it lists the whole
 * aggregated catalogue grouped into Core / Servers-by-management-cluster /
 * Workflows (plus Favourites and Recent quick-access), and a non-empty query
 * switches to `filter_tools` BM25-ranked results with keyboard navigation.
 */
export function ToolBrowser({
  installation,
  selected,
  onSelect,
  servers,
  prefs,
  serverScope,
  serversLoading = false,
}: ToolBrowserProps) {
  const musterApi = useApi(musterApiRef);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  // A `?server=` deep link scopes the browse until the user clears it.
  const [scopeCleared, setScopeCleared] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  // ⌘K / Ctrl-K focuses the search field from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const browse = useQuery({
    queryKey: ['muster', 'tools-browse', installation],
    queryFn: () => musterApi.filterTools({ installation, limit: BROWSE_LIMIT }),
    enabled: trimmed === '',
  });

  const search = useQuery({
    queryKey: ['muster', 'tools-search', installation, trimmed],
    queryFn: () =>
      musterApi.filterTools({
        installation,
        query: trimmed,
        limit: SEARCH_LIMIT,
      }),
    enabled: trimmed !== '',
  });

  const allTools = useMemo(() => browse.data?.tools ?? [], [browse.data]);
  const byName = useMemo(() => {
    const map = new Map<string, ToolSummary>();
    for (const tool of allTools) {
      map.set(tool.name, tool);
    }
    return map;
  }, [allTools]);

  // Scope to a `?server=` deep link's tools (by prefix) when set, the search box
  // is empty, and the user hasn't cleared the scope.
  const scoped = useMemo(
    () =>
      serverScope && !scopeCleared && trimmed === ''
        ? toolsForServer(allTools, serverScope, servers)
        : undefined,
    [serverScope, scopeCleared, trimmed, allTools, servers],
  );

  const groups = useMemo(
    () => groupTools(scoped ? scoped.tools : allTools, servers),
    [scoped, allTools, servers],
  );

  const searchTools = search.data?.tools ?? [];
  useEffect(() => setActiveIndex(-1), [trimmed, searchTools.length]);

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (trimmed === '' || searchTools.length === 0) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, searchTools.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = searchTools[activeIndex] ?? searchTools[0];
      if (pick) {
        onSelect(pick.name);
      }
    }
  };

  const favouriteTools = prefs.favourites
    .map(name => byName.get(name) ?? { name })
    .filter(Boolean);
  const recentTools = prefs.recents
    .filter(name => !prefs.favourites.includes(name))
    .map(name => byName.get(name) ?? { name });

  return (
    <Box>
      <Box mb="3" ref={searchRef}>
        <SearchField
          aria-label="Search tools"
          placeholder="e.g. list pods, prometheus query  (⌘K)"
          value={query}
          onChange={setQuery}
          onKeyDown={onSearchKeyDown}
        />
      </Box>

      {trimmed !== '' ? (
        <SearchResults
          isLoading={search.isLoading}
          error={search.error}
          installation={installation}
          tools={searchTools}
          truncated={search.data?.truncated ?? false}
          total={search.data?.total ?? 0}
          selected={selected}
          activeIndex={activeIndex}
          prefs={prefs}
          onSelect={onSelect}
        />
      ) : (
        <>
          {scoped ? (
            <Flex align="center" justify="between" gap="2" mb="2">
              <Flex align="center" gap="2">
                <Badge>Server: {serverScope}</Badge>
                <Text variant="body-small" color="secondary">
                  {scoped.tools.length} tool
                  {scoped.tools.length === 1 ? '' : 's'}
                </Text>
              </Flex>
              <Button
                variant="tertiary"
                size="small"
                onClick={() => setScopeCleared(true)}
              >
                Show all tools
              </Button>
            </Flex>
          ) : (
            (favouriteTools.length > 0 || recentTools.length > 0) && (
              <QuickAccess
                favourites={favouriteTools}
                recents={recentTools}
                selected={selected}
                prefs={prefs}
                onSelect={onSelect}
              />
            )
          )}
          <BrowseGroups
            isLoading={browse.isLoading || serversLoading}
            error={browse.error}
            installation={installation}
            groups={groups}
            selected={selected}
            prefs={prefs}
            onSelect={onSelect}
          />
        </>
      )}
    </Box>
  );
}

function QuickHeader({ children }: { children: React.ReactNode }) {
  return (
    <Box mt="2" mb="1">
      <Text
        as="p"
        variant="body-x-small"
        color="secondary"
        weight="bold"
        style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
      >
        {children}
      </Text>
    </Box>
  );
}

function QuickAccess({
  favourites,
  recents,
  selected,
  prefs,
  onSelect,
}: {
  favourites: ToolSummary[];
  recents: ToolSummary[];
  selected?: string;
  prefs: ToolPrefs;
  onSelect: (name: string) => void;
}) {
  const renderList = (tools: ToolSummary[], ariaLabel: string) => (
    <ToolTable
      ariaLabel={ariaLabel}
      items={tools.map(tool =>
        browserItem(tool, {
          selected: tool.name === selected,
          favourite: prefs.isFavourite(tool.name),
          onSelect,
          onToggleFavourite: prefs.toggleFavourite,
        }),
      )}
    />
  );
  return (
    <Box>
      {favourites.length > 0 && (
        <>
          <QuickHeader>Favourites ({favourites.length})</QuickHeader>
          {renderList(favourites, 'Favourite tools')}
        </>
      )}
      {recents.length > 0 && (
        <>
          <QuickHeader>Recent ({recents.length})</QuickHeader>
          {renderList(recents, 'Recent tools')}
        </>
      )}
    </Box>
  );
}

function BrowseGroups({
  isLoading,
  error,
  installation,
  groups,
  selected,
  prefs,
  onSelect,
}: {
  isLoading: boolean;
  error: unknown;
  installation?: string;
  groups: ToolGroup[];
  selected?: string;
  prefs: ToolPrefs;
  onSelect: (name: string) => void;
}) {
  const classes = useStyles();
  if (isLoading) {
    return <BrowserSkeleton />;
  }
  if (error) {
    return <ExplorerError error={error} installation={installation} />;
  }
  if (groups.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        No tools available from this installation.
      </Text>
    );
  }
  const coreKeys = groups.filter(g => g.kind === 'core').map(g => g.key);
  // `defaultExpandedKeys` applies on mount only, so key the group by its
  // contents to re-expand Core when the installation/scope changes.
  const groupSignature = groups.map(g => g.key).join('|');
  return (
    <AccordionGroup
      key={groupSignature}
      allowsMultiple
      defaultExpandedKeys={coreKeys}
    >
      {groups.map(group => (
        <Accordion id={group.key} key={group.key}>
          <AccordionTrigger subtitle={group.subtitle}>
            {group.key} ({group.tools.length})
          </AccordionTrigger>
          <AccordionPanel>
            <Box className={classes.panel}>
              <ToolTable
                ariaLabel={`${group.key} tools`}
                items={group.tools.map(tool =>
                  browserItem(tool, {
                    selected: tool.name === selected,
                    favourite: prefs.isFavourite(tool.name),
                    onSelect,
                    onToggleFavourite: prefs.toggleFavourite,
                  }),
                )}
              />
            </Box>
          </AccordionPanel>
        </Accordion>
      ))}
    </AccordionGroup>
  );
}

function SearchResults({
  isLoading,
  error,
  installation,
  tools,
  truncated,
  total,
  selected,
  activeIndex,
  prefs,
  onSelect,
}: {
  isLoading: boolean;
  error: unknown;
  installation?: string;
  tools: ToolSummary[];
  truncated: boolean;
  total: number;
  selected?: string;
  activeIndex: number;
  prefs: ToolPrefs;
  onSelect: (name: string) => void;
}) {
  const classes = useStyles();
  if (isLoading) {
    return <BrowserSkeleton rows={5} />;
  }
  if (error) {
    return <ExplorerError error={error} installation={installation} />;
  }
  if (tools.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        No tools match this search.
      </Text>
    );
  }
  return (
    <>
      <Flex align="center" justify="between" gap="2" mb="1">
        <Text variant="body-small" color="secondary">
          {total} match{total === 1 ? '' : 'es'}
          {truncated ? ` (showing top ${tools.length})` : ''}
        </Text>
        <Text variant="body-small" color="secondary" className={classes.kbd}>
          ↑↓ navigate · ↵ open
        </Text>
      </Flex>
      <ToolTable
        ariaLabel="Search results"
        items={tools.map((tool, index) =>
          browserItem(tool, {
            selected: tool.name === selected,
            active: index === activeIndex,
            favourite: prefs.isFavourite(tool.name),
            onSelect,
            onToggleFavourite: prefs.toggleFavourite,
          }),
        )}
      />
    </>
  );
}
