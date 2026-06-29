import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import SearchIcon from '@material-ui/icons/Search';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
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

const useStyles = makeStyles((theme: Theme) => ({
  search: {
    marginBottom: theme.spacing(2),
  },
  toolName: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  group: {
    boxShadow: 'none',
    '&:before': { display: 'none' },
  },
  groupSummary: {
    minHeight: 40,
  },
  groupTitle: {
    fontWeight: 600,
    display: 'flex',
    alignItems: 'baseline',
    gap: theme.spacing(1),
  },
  groupSub: {
    color: theme.palette.text.secondary,
    fontWeight: 400,
    fontSize: '0.75rem',
  },
  details: {
    padding: 0,
    display: 'block',
    maxHeight: 360,
    overflow: 'auto',
  },
  selected: {
    backgroundColor: theme.palette.action.selected,
  },
  active: {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: -2,
  },
  quickHeader: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
    margin: theme.spacing(1, 0, 0.5),
  },
  scopeBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  kbd: {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
  },
}));

function ToolRow({
  tool,
  selected,
  active,
  favourite,
  onSelect,
  onToggleFavourite,
}: {
  tool: ToolSummary;
  selected: boolean;
  active?: boolean;
  favourite: boolean;
  onSelect: (name: string) => void;
  onToggleFavourite: (name: string) => void;
}) {
  const classes = useStyles();
  return (
    <ListItem
      button
      dense
      divider
      className={`${selected ? classes.selected : ''} ${
        active ? classes.active : ''
      }`}
      onClick={() => onSelect(tool.name)}
    >
      <ListItemText
        primary={
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <span className={classes.toolName}>{tool.name}</span>
            {tool.score !== undefined && (
              <Chip size="small" label={`score ${tool.score}`} />
            )}
          </Box>
        }
        secondary={tool.summary ?? tool.description}
      />
      <ListItemSecondaryAction>
        <IconButton
          edge="end"
          size="small"
          onClick={() => onToggleFavourite(tool.name)}
        >
          {favourite ? (
            <StarIcon fontSize="small" color="primary" />
          ) : (
            <StarBorderIcon fontSize="small" />
          )}
        </IconButton>
      </ListItemSecondaryAction>
    </ListItem>
  );
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
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  // A `?server=` deep link scopes the browse until the user clears it.
  const [scopeCleared, setScopeCleared] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  // ⌘K / Ctrl-K focuses the search field from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
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
      <TextField
        className={classes.search}
        fullWidth
        variant="outlined"
        size="small"
        label="Search tools"
        placeholder="e.g. list pods, prometheus query  (⌘K)"
        value={query}
        inputRef={searchRef}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onSearchKeyDown}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

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
            <Box className={classes.scopeBanner}>
              <Chip
                size="small"
                color="primary"
                label={`Server: ${serverScope}`}
              />
              <Typography variant="caption" color="textSecondary">
                {scoped.tools.length} tool
                {scoped.tools.length === 1 ? '' : 's'}
              </Typography>
              <Box flexGrow={1} />
              <Button size="small" onClick={() => setScopeCleared(true)}>
                Show all tools
              </Button>
            </Box>
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
  const classes = useStyles();
  const renderList = (tools: ToolSummary[]) => (
    <List dense disablePadding>
      {tools.map(tool => (
        <ToolRow
          key={tool.name}
          tool={tool}
          selected={tool.name === selected}
          favourite={prefs.isFavourite(tool.name)}
          onSelect={onSelect}
          onToggleFavourite={prefs.toggleFavourite}
        />
      ))}
    </List>
  );
  return (
    <Box>
      {favourites.length > 0 && (
        <>
          <Typography className={classes.quickHeader}>
            Favourites ({favourites.length})
          </Typography>
          {renderList(favourites)}
        </>
      )}
      {recents.length > 0 && (
        <>
          <Typography className={classes.quickHeader}>
            Recent ({recents.length})
          </Typography>
          {renderList(recents)}
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
      <Typography variant="body2" color="textSecondary">
        No tools available from this installation.
      </Typography>
    );
  }
  return (
    <>
      {groups.map(group => (
        <Accordion
          key={group.key}
          className={classes.group}
          defaultExpanded={group.kind === 'core'}
          TransitionProps={{ unmountOnExit: true }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            className={classes.groupSummary}
          >
            <Typography className={classes.groupTitle}>
              {group.key} ({group.tools.length})
              {group.subtitle && (
                <span className={classes.groupSub}>· {group.subtitle}</span>
              )}
            </Typography>
          </AccordionSummary>
          <AccordionDetails className={classes.details}>
            <List dense disablePadding style={{ width: '100%' }}>
              {group.tools.map(tool => (
                <ToolRow
                  key={tool.name}
                  tool={tool}
                  selected={tool.name === selected}
                  favourite={prefs.isFavourite(tool.name)}
                  onSelect={onSelect}
                  onToggleFavourite={prefs.toggleFavourite}
                />
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      ))}
    </>
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
      <Typography variant="body2" color="textSecondary">
        No tools match this search.
      </Typography>
    );
  }
  return (
    <>
      <Box display="flex" alignItems="center" style={{ gap: 8 }}>
        <Typography variant="caption" color="textSecondary">
          {total} match{total === 1 ? '' : 'es'}
          {truncated ? ` (showing top ${tools.length})` : ''}
        </Typography>
        <Box flexGrow={1} />
        <Typography variant="caption" className={classes.kbd}>
          ↑↓ navigate · ↵ open
        </Typography>
      </Box>
      <List dense disablePadding>
        {tools.map((tool, index) => (
          <ToolRow
            key={tool.name}
            tool={tool}
            selected={tool.name === selected}
            active={index === activeIndex}
            favourite={prefs.isFavourite(tool.name)}
            onSelect={onSelect}
            onToggleFavourite={prefs.toggleFavourite}
          />
        ))}
      </List>
    </>
  );
}
