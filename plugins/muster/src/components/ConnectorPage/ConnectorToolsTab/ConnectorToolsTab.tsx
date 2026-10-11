import { ReactNode, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  Box,
  Flex,
  SearchField,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  INITIAL_ROWS,
  LoadingIndicator,
  SEARCH_MIN,
  ShowMore,
} from '@giantswarm/backstage-plugin-ui-react';
import { ToolSummary } from '../../../apis';
import { toolEffect, ToolEffect } from '../../../lib/toolAnnotations';
import { toolMatchesQuery } from '../../../lib/toolSearch';
import { EffectBadge } from '../../shared';
import { ToolDetailPanel } from '../../ToolDetail';
import { ServerTools } from '../../ServerPage/useServerPageData';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  search: {
    flex: '0 1 280px',
    minWidth: 200,
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flex: '1 1 auto',
    minWidth: 0,
    textAlign: 'left',
  },
  rowText: {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
    // A tool's label is one snake_case token: it breaks rather than run
    // under the effect badge on a phone.
    overflowWrap: 'anywhere',
  },
  tryIt: {
    margin: '4px 0 12px',
    padding: 18,
    borderRadius: 12,
    background: 'var(--bui-bg-neutral-1)',
  },
});

type EffectFilter = 'all' | ToolEffect;

const FILTER_LABELS: Record<EffectFilter, string> = {
  all: 'All',
  reads: 'Reads',
  changes: 'Changes things',
};

export interface ConnectorToolsTabProps {
  installation: string;
  tools: ServerTools;
  /** Whether a call reaches the server with the caller's own identity. */
  runsAsCaller: boolean;
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

/** What the Try it panel says beside its button for a tool. */
export function tryItNote(
  effect: ToolEffect,
  runsAsCaller: boolean,
): string | undefined {
  const parts = [
    runsAsCaller ? 'Runs as you.' : undefined,
    effect === 'reads' ? 'Nothing is changed.' : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function ToolRow({
  tool,
  label,
  open,
  installation,
  runsAsCaller,
}: {
  tool: ToolSummary;
  label: string;
  open: boolean;
  installation: string;
  runsAsCaller: boolean;
}) {
  const classes = useStyles();
  const effect = toolEffect(tool);
  const description = tool.description ?? tool.summary;
  return (
    <Accordion id={tool.name}>
      <AccordionTrigger>
        <span className={classes.trigger}>
          <span className={classes.rowText}>
            <Text variant="body-medium" weight="bold">
              {label}
            </Text>
            {description && (
              <Text variant="body-small" color="secondary" truncate>
                {description}
              </Text>
            )}
          </span>
          <EffectBadge effect={effect} />
        </span>
      </AccordionTrigger>
      <AccordionPanel>
        {open && (
          <div className={classes.tryIt}>
            <Text as="h4" variant="body-medium" weight="bold">
              Try it
            </Text>
            <ToolDetailPanel
              name={tool.name}
              installation={installation}
              showMarkers={false}
              note={tryItNote(effect, runsAsCaller)}
              runLabel="Run"
            />
          </div>
        )}
      </AccordionPanel>
    </Accordion>
  );
}

/**
 * The connector's tools as an expandable list: a search, a filter by what a
 * tool does with a count per choice, and per tool its effect and an inline
 * Try it that runs the tool through muster. A short list (`SEARCH_MIN` or
 * fewer) is read, not searched, so it shows neither; a long one renders a
 * page of tools at a time.
 */
export function ConnectorToolsTab({
  installation,
  tools,
  runsAsCaller,
  emptyExplanation,
  sessionGate,
  signInGate,
}: ConnectorToolsTabProps) {
  const classes = useStyles();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EffectFilter>('all');
  const [openTool, setOpenTool] = useState<string | undefined>();

  const { tools: listed, shortName } = tools;
  const all = useMemo(() => listed ?? [], [listed]);
  const counts = useMemo(() => {
    const reads = all.filter(tool => toolEffect(tool) === 'reads').length;
    return { all: all.length, reads, changes: all.length - reads };
  }, [all]);
  const shown = useMemo(
    () =>
      all.filter(
        tool =>
          (filter === 'all' || toolEffect(tool) === filter) &&
          toolMatchesQuery(tool, shortName(tool.name), query),
      ),
    [all, filter, query, shortName],
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

  // Three tools are read at a glance; a search and an All/Reads/Changes
  // filter over them is volume framing.
  const searchable = all.length > SEARCH_MIN;

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
          <ToggleButtonGroup
            aria-label="Filter by what a tool does"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[filter]}
            onSelectionChange={keys => {
              const next = [...keys][0];
              if (next === 'all' || next === 'reads' || next === 'changes') {
                setFilter(next);
              }
            }}
          >
            {(['all', 'reads', 'changes'] as const).map(id => (
              <ToggleButton key={id} id={id} size="small">
                {`${FILTER_LABELS[id]} ${counts[id]}`}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
      )}
      {tools.truncated && (
        <Text as="p" variant="body-small" color="secondary">
          This list may be incomplete: muster returned only part of the tools.
        </Text>
      )}
      {shown.length === 0 ? (
        <Text as="p" variant="body-medium" color="secondary">
          No tools match.
        </Text>
      ) : (
        // A server can list hundreds of tools, each an accordion; a page of
        // them at a time, starting over when the search or filter changes.
        <ShowMore
          key={`${filter}|${query}`}
          items={shown}
          initial={INITIAL_ROWS}
          noun="tool"
        >
          {page => (
            <AccordionGroup
              expandedKeys={openTool ? [openTool] : []}
              onExpandedChange={keys => {
                const [next] = [...keys];
                setOpenTool(next === undefined ? undefined : String(next));
              }}
            >
              {page.map(tool => (
                <ToolRow
                  key={tool.name}
                  tool={tool}
                  label={shortName(tool.name)}
                  open={openTool === tool.name}
                  installation={installation}
                  runsAsCaller={runsAsCaller}
                />
              ))}
            </AccordionGroup>
          )}
        </ShowMore>
      )}
    </Flex>
  );
}
