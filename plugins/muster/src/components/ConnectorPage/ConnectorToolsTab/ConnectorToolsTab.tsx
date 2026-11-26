import { MouseEvent, ReactNode, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, ButtonLink, Flex, SearchField, Text } from '@backstage/ui';
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
  grantLabel,
  useApprovalGrants,
  type ApprovalGrant,
} from '../../../hooks/useApprovalGrants';
import {
  approvalSourceLabel,
  APPROVAL_SETTINGS,
  connectorAdminOf,
  approvalRefusalNote,
  approvalRefusalReason,
  isSettingsUnreadable,
  isUnreviewed,
  reportedSetting,
  unreviewedSetting,
  type ApprovalSetting,
} from '../../../lib/toolApproval';
import {
  ApprovalBadge,
  EffectBadge,
  MarkerBadge,
  TruncatedListNote,
  type ToolsListView,
  useServerPageLinks,
} from '../../shared';
import type { NoToolsExplanation } from '../../McpServersPage/serverDetail';
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
  note: {
    marginBottom: 8,
  },
});

/**
 * The "What it does" dropdown, as the wizard's catalogue draws it (T81). A
 * blocked tool's row (muster lists no blocked tool, so the row knows nothing
 * of what it does and shows no effect) counts nowhere.
 */
const EFFECT_FACET: CatalogFacet<ToolSummary> = {
  id: 'effect',
  label: 'What it does',
  value: tool =>
    tool.approval?.setting === 'block' ? undefined : toolEffect(tool),
  optionLabel: id => TOOL_EFFECT_LABELS[id as ToolEffect] ?? id,
  order: ['reads', 'changes'],
};

/** The *Approval* dropdown: Allow, Ask, Block, as muster reports them. */
const APPROVAL_FACET: CatalogFacet<ToolSummary> = {
  id: 'approval',
  label: 'Approval',
  value: tool => (tool.approval ? reportedSetting(tool.approval) : undefined),
  order: APPROVAL_SETTINGS,
};

const EFFECT_FACETS: readonly CatalogFacet<ToolSummary>[] = [EFFECT_FACET];
const APPROVAL_FACETS: readonly CatalogFacet<ToolSummary>[] = [
  EFFECT_FACET,
  APPROVAL_FACET,
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
  /**
   * Why the connector lists no tools, when it lists none: a `warning` is an
   * alert, otherwise plain text.
   */
  emptyExplanation: NoToolsExplanation;
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
  /**
   * The exposed names of the tools the connector blocks, which muster hides
   * from every listing (from `spec.approval`): listed after the rest, with no
   * page to open.
   */
  blockedTools?: readonly string[];
  /**
   * The connector's edit at its *Test & Tools* step, where a connector admin
   * changes the settings; absent where the wizard cannot edit it.
   */
  settingsHref?: string;
  /** Its settings are changed in Git (a GitOps-managed connector). */
  settingsInGit?: boolean;
  /**
   * The connector's stored rule for tools without their own entry
   * (`spec.approval.rule`). *Block* hides every tool added later, which
   * muster then lists nowhere, so the tab says so.
   */
  newToolsRule?: string;
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
  blockedTools,
  settingsHref,
  settingsInGit,
  newToolsRule,
}: ConnectorToolsTabProps) {
  const classes = useStyles();
  const ownSearch = useToolSearchState();
  const { query, setQuery, openedSearched, initialSelection, opened } =
    searchState ?? ownSearch;
  const links = useServerPageLinks();
  const location = useLocation();
  const navigate = useNavigate();

  const { tools: listed, shortName } = tools;
  // The agents that may skip the connector's Asks (tool approval): by
  // muster's server key, which its tools carry.
  const serverKey = listed?.find(tool => tool.server)?.server;
  const grantsReading = useApprovalGrants(installation, serverKey);
  const { grants } = grantsReading;
  // Exceptions by a broader entry (the whole connector, a preset, the
  // default) cover more than one tool: said once, above the list.
  // Those that name no tools (older records) are said once above the list.
  const broadGrants = grants.filter(
    grant => !grant.entry.startsWith('tool:') && !grant.tools?.length,
  );
  const all = useMemo<ToolSummary[]>(() => {
    const known = new Set((listed ?? []).map(tool => tool.name));
    return [
      ...(listed ?? []),
      ...(blockedTools ?? [])
        .filter(name => !known.has(name))
        .map(name => ({
          name,
          approval: { setting: 'block' as const, source: 'tool' as const },
        })),
    ];
  }, [listed, blockedTools]);
  const blocked = useMemo(
    () =>
      new Set(
        (blockedTools ?? []).filter(name => all.some(t => t.name === name)),
      ),
    [blockedTools, all],
  );
  const reportsApproval = all.some(tool => tool.approval);
  const searched = useMemo(
    () =>
      all.filter(tool => toolMatchesQuery(tool, shortName(tool.name), query)),
    [all, query, shortName],
  );
  const filters = useCatalogFilters({
    items: all,
    searched,
    facets: reportsApproval ? APPROVAL_FACETS : EFFECT_FACETS,
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
    blocked.has(tool.name)
      ? undefined
      : links.tool(server, tool.name, installation, view);
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
  const listedTools = listed ?? [];
  // Every tool of a connector nobody reviewed is *New* to muster (a create's
  // rule, no entries): the note says it once instead.
  const reviewed = isUnreviewed(listedTools) !== true;
  const approvalNote = (
    <ApprovalNote
      unavailable={isSettingsUnreadable(listedTools)}
      refusalReason={approvalRefusalReason(listedTools)}
      unreviewed={
        isUnreviewed(listedTools) === true
          ? unreviewedSetting(listedTools)
          : undefined
      }
      admin={connectorAdminOf(listedTools)}
      settingsHref={settingsHref}
      settingsInGit={settingsInGit}
      blocksNewTools={reviewed && newToolsRule === 'Block'}
    />
  );

  if (all.length === 0) {
    if (signInGate) {
      return <>{signInGate}</>;
    }
    return emptyExplanation.tone === 'warning' ? (
      <Alert status="warning" description={emptyExplanation.text} />
    ) : (
      <Text as="p" variant="body-medium" color="secondary">
        {emptyExplanation.text}
      </Text>
    );
  }

  // A tool or two is read at a glance; kept while a search or filter is in
  // force (the URL's or a saved view's too), so it can be undone.
  const searchable = isSearchableList(
    all.length,
    openedSearched || query.trim() !== '' || filters.isFiltered,
  );

  return (
    <Flex direction="column" gap="0">
      {signInGate}
      {approvalNote}
      {reportsApproval &&
        (grantsReading.status === 'error' ||
          grantsReading.status === 'partial') && (
          <Alert
            className={classes.note}
            status="warning"
            title="Could not read which agents are allowed"
            description={
              grantsReading.refused
                ? "Exceptions are listed only for the namespaces whose agents you may read, so an agent elsewhere may skip this connector's Ask without being named here."
                : "agent-manager could not be asked, so an agent may skip this connector's Ask without being named here."
            }
          />
        )}
      {broadGrants.length > 0 && (
        <Text variant="body-small" color="secondary" className={classes.note}>
          Allowed by a broader exception:{' '}
          {broadGrants
            .map(grant => `${grantLabel(grant)}, for ${entryKind(grant.entry)}`)
            .join('; ')}
        </Text>
      )}
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
            dimensions={filters.dimensions}
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
                  status: (
                    <ToolStatus
                      tool={tool}
                      listed={!blocked.has(tool.name)}
                      reviewed={reviewed}
                    />
                  ),
                  facts: approvalFacts(tool, reviewed, grants, shortName),
                  description: blocked.has(tool.name)
                    ? 'Hidden from everyone, so muster lists it nowhere else.'
                    : (tool.description ?? tool.summary),
                }))}
              />
            )}
          </ShowMore>
        </div>
      )}
    </Flex>
  );
}

/** A grant's entry in words: what its exception covers. */
function entryKind(entry: string): string {
  if (entry === 'default') return "the agent's default";
  if (entry.startsWith('server:')) return 'every tool of this connector';
  if (entry.startsWith('preset:')) return `the preset ${entry.slice(7)}`;
  if (entry.startsWith('workflow:')) return `the workflow ${entry.slice(9)}`;
  return entry;
}

/** What a tool does, and its approval where muster reports one. */
function ToolStatus({
  tool,
  listed,
  reviewed,
}: {
  tool: ToolSummary;
  listed: boolean;
  reviewed: boolean;
}) {
  return (
    <Flex align="center" gap="1">
      {listed && <EffectBadge effect={toolEffect(tool)} />}
      {tool.approval && (
        <ApprovalBadge
          setting={reportedSetting(tool.approval)}
          builtIn={tool.approval.source === 'builtin'}
        />
      )}
      {reviewed && tool.approval?.new && (
        <MarkerBadge tone="neutral">New</MarkerBadge>
      )}
    </Flex>
  );
}

/**
 * Where a tool's setting comes from — nothing for a connector nobody
 * reviewed: the note above the list says it once — and *Allowed for*: the
 * agents that may skip its *Ask* (agent-manager's grants for that tool).
 */
function approvalFacts(
  tool: ToolSummary,
  reviewed: boolean,
  grants: readonly ApprovalGrant[] = [],
  ownName?: (name: string) => string,
): string[] {
  const facts: string[] = [];
  const source = tool.approval?.source;
  if (reviewed && source && source !== 'unreviewed' && source !== 'builtin') {
    facts.push(approvalSourceLabel(source));
  }
  // The agents that may skip its Ask: an exception for exactly this tool,
  // or a broader one that names it among the tools it covers.
  const own = ownName?.(tool.name);
  const allowed = grants.filter(
    grant =>
      grant.entry === `tool:${tool.name}` ||
      (own !== undefined && (grant.tools ?? []).includes(own)),
  );
  if (tool.approval?.setting === 'ask' && allowed.length > 0) {
    facts.push(`Allowed for: ${allowed.map(grantLabel).join(', ')}`);
  }
  return facts;
}

/**
 * The connector's tool approval as a whole, above its tools: approvals
 * cannot be answered right now (a warning an admin can act on, beside the
 * rest); muster cannot read the settings; nobody reviewed them (with the way to, for a connector
 * admin); or, reviewed, where a connector admin changes them.
 */
function ApprovalNote({
  refusalReason,
  blocksNewTools,
  ...settings
}: {
  unavailable: boolean;
  refusalReason?: string;
  /** The rule is *Block*: tools added later are hidden. */
  blocksNewTools?: boolean;
  /** What every tool does while nobody reviewed the settings. */
  unreviewed: ApprovalSetting | undefined;
  admin: boolean | undefined;
  settingsHref?: string;
  settingsInGit?: boolean;
}) {
  const classes = useStyles();
  return (
    <>
      {refusalReason && (
        <Alert
          className={classes.note}
          status="warning"
          {...approvalRefusalNote(refusalReason)}
        />
      )}
      {blocksNewTools && (
        <Alert
          className={classes.note}
          status="info"
          title="Block for new tools"
          description="Tools this connector adds later are hidden and can't be used until a connector admin sets them, so they are not listed here."
        />
      )}
      <SettingsNote {...settings} />
    </>
  );
}

function SettingsNote({
  unavailable,
  unreviewed,
  admin,
  settingsHref,
  settingsInGit,
}: {
  unavailable: boolean;
  unreviewed: ApprovalSetting | undefined;
  admin: boolean | undefined;
  settingsHref?: string;
  settingsInGit?: boolean;
}) {
  const classes = useStyles();
  const canChange = admin === true && Boolean(settingsHref);
  if (unavailable) {
    return (
      <Alert
        className={classes.note}
        status="warning"
        title="The tool settings can't be read"
        description="Muster could not read this connector's tool approval settings. It reports every tool as Ask and does not run them until it can read the settings."
      />
    );
  }
  if (unreviewed) {
    let how = 'A connector admin can review them.';
    if (canChange) {
      how = 'Review them to choose which tools ask first or are hidden.';
    } else if (settingsInGit) {
      how = "Review them in Git: the MCPServer's spec.approval.";
    }
    return (
      <Alert
        className={classes.note}
        status="info"
        title={`${unreviewed} — not reviewed`}
        description={`${
          unreviewed === 'Allow'
            ? 'Every tool runs without asking'
            : 'Every tool asks first'
        } until its settings are reviewed. ${how}`}
        customActions={
          canChange ? (
            <ButtonLink size="small" variant="secondary" href={settingsHref}>
              Review tool settings
            </ButtonLink>
          ) : undefined
        }
      />
    );
  }
  if (canChange) {
    return (
      <Flex justify="end" className={classes.note}>
        <ButtonLink size="small" variant="tertiary" href={settingsHref}>
          Change tool settings
        </ButtonLink>
      </Flex>
    );
  }
  return null;
}
