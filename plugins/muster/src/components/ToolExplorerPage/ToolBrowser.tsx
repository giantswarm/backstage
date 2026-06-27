import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef, ToolSummary } from '../../apis';

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
  groupTitle: {
    fontWeight: 600,
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
}));

/**
 * Group a tool name into a browse section. Core and workflow tools have fixed
 * sections; aggregated `x_<segment>_*` tools group by their first segment
 * (muster's family/server prefix).
 *
 * ponytail: groups aggregated tools by the leading name segment rather than
 * resolving each to its MCPServer CR (server prefixes aren't unique per the CR
 * heuristic). Upgrade path: match against the server tool-name prefixes once
 * the aggregator exposes them.
 */
function groupFor(name: string): string {
  if (name.startsWith('core_')) {
    return 'Core';
  }
  if (name.startsWith('workflow_')) {
    return 'Workflows';
  }
  if (name.startsWith('x_')) {
    const segment = name.slice(2).split('_')[0];
    return segment ? `Server: ${segment}` : 'Servers';
  }
  return 'Other';
}

function ToolRow({
  tool,
  selected,
  onSelect,
}: {
  tool: ToolSummary;
  selected: boolean;
  onSelect: (name: string) => void;
}) {
  const classes = useStyles();
  return (
    <ListItem
      button
      dense
      divider
      className={selected ? classes.selected : undefined}
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
    </ListItem>
  );
}

export interface ToolBrowserProps {
  installation?: string;
  selected?: string;
  onSelect: (name: string) => void;
}

/**
 * Left-hand browse/search panel. With an empty query it lists the whole
 * aggregated catalogue grouped into Core / Servers / Workflows; a non-empty
 * query switches to `filter_tools` BM25-ranked results.
 */
export function ToolBrowser({
  installation,
  selected,
  onSelect,
}: ToolBrowserProps) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

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

  const grouped = useMemo(() => {
    const tools = browse.data?.tools ?? [];
    const groups = new Map<string, ToolSummary[]>();
    for (const tool of tools) {
      const key = groupFor(tool.name);
      const bucket = groups.get(key) ?? [];
      bucket.push(tool);
      groups.set(key, bucket);
    }
    // Stable section order: Core, Workflows, Servers (alpha), Other last.
    const rank = (key: string) => {
      if (key === 'Core') return 0;
      if (key === 'Workflows') return 1;
      if (key === 'Other') return 3;
      return 2;
    };
    return [...groups.entries()].sort(([a], [b]) => {
      const r = rank(a) - rank(b);
      return r !== 0 ? r : a.localeCompare(b);
    });
  }, [browse.data]);

  return (
    <Box>
      <TextField
        className={classes.search}
        fullWidth
        variant="outlined"
        size="small"
        label="Search tools"
        placeholder="e.g. list pods, prometheus query"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      {trimmed !== '' ? (
        <SearchResults
          isLoading={search.isLoading}
          error={search.error}
          tools={search.data?.tools ?? []}
          truncated={search.data?.truncated ?? false}
          total={search.data?.total ?? 0}
          selected={selected}
          onSelect={onSelect}
        />
      ) : (
        <BrowseGroups
          isLoading={browse.isLoading}
          error={browse.error}
          groups={grouped}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </Box>
  );
}

function BrowseGroups({
  isLoading,
  error,
  groups,
  selected,
  onSelect,
}: {
  isLoading: boolean;
  error: unknown;
  groups: [string, ToolSummary[]][];
  selected?: string;
  onSelect: (name: string) => void;
}) {
  const classes = useStyles();
  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <ResponseErrorPanel error={error as Error} />;
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
      {groups.map(([groupName, tools]) => (
        <Accordion key={groupName} className={classes.group}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography className={classes.groupTitle}>
              {groupName} ({tools.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails className={classes.details}>
            <List dense disablePadding style={{ width: '100%' }}>
              {tools.map(tool => (
                <ToolRow
                  key={tool.name}
                  tool={tool}
                  selected={tool.name === selected}
                  onSelect={onSelect}
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
  tools,
  truncated,
  total,
  selected,
  onSelect,
}: {
  isLoading: boolean;
  error: unknown;
  tools: ToolSummary[];
  truncated: boolean;
  total: number;
  selected?: string;
  onSelect: (name: string) => void;
}) {
  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <ResponseErrorPanel error={error as Error} />;
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
      <Typography variant="caption" color="textSecondary">
        {total} match{total === 1 ? '' : 'es'}
        {truncated ? ` (showing top ${tools.length})` : ''}
      </Typography>
      <List dense disablePadding>
        {tools.map(tool => (
          <ToolRow
            key={tool.name}
            tool={tool}
            selected={tool.name === selected}
            onSelect={onSelect}
          />
        ))}
      </List>
    </>
  );
}
