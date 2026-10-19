import { ReactNode, useCallback, useEffect, useId, useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Progress } from '@backstage/core-components';
import { ButtonIcon, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import {
  InventoryFailureGate,
  useInstallationInventory,
} from '@giantswarm/backstage-plugin-gs';
import {
  type CatalogFacet,
  CatalogFilterBar,
  CatalogNoMatch,
  EmptyStateCard,
  joinNames,
  LoadingIndicator,
  PHONE_MEDIA,
  StatusDot,
  useCatalogFilters,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useFavoriteAgents } from '../../hooks/useFavoriteAgents';
import { useKagentCapabilitiesMap } from '../../hooks/useKagentCapabilities';
import { ACCESS_GRANT_HINT } from '../../lib/tenants';
import type { AvatarSize } from '../../lib/agentAvatar';
import {
  agentHarnesses,
  agentParts,
  agentStatus,
  harnessLabel,
  searchAgents,
} from '../../lib/customize';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { AgentsHelperBanner } from '../AgentsHelperBanner';
import {
  type AgentRow,
  describeKagentSwitchedOff,
  useAgents,
} from '../AgentsDataProvider';
import { FirstAgentCard } from '../FirstAgentCard';
import { KagentMissingCard } from '../KagentMissingCard';
import { LastUsedAgents } from '../LastUsedAgents';
import { SessionsDataProvider } from '../SessionsDataProvider';
import { ShowMore } from '../ShowMore';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

/** Twice the rendered 32px (bui's medium avatar), for sharp 2x displays. */
const ROW_AVATAR_SIZE: AvatarSize = 96;

/**
 * Rows rendered before *Show 25 more agents*, and how many each press adds:
 * an installation with 300 agents is a list nobody scrolls — the search above
 * the tab is how a specific agent is found.
 */
export const AGENTS_PAGE_SIZE = 25;

/** Two lines, then an ellipsis: what a phone row shows of a long text. */
const TWO_LINES = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
} as const;

const useStyles = makeStyles({
  // The list and the "loading more" bar over the gap above it.
  listFrame: {
    position: 'relative',
  },
  // Laid over the middle of the panel's gap above the list rather than in a
  // slot of its own: the list neither moves when it comes and goes nor sits
  // lower on a settled fleet. 4px is the bar's own height.
  loadingMore: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 'calc(var(--bui-space-5) / -2 - 2px)',
  },
  // The prototype's agent list: one rounded, bordered surface, an avatar row
  // per agent — no column headers.
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    background: 'var(--bui-bg-neutral-1)',
    overflow: 'hidden',
  },
  // The row is the link plus the star beside it: a button can't live inside
  // a link, so the star sits after it and the hover tints both.
  item: {
    display: 'flex',
    alignItems: 'center',
    paddingRight: 'var(--bui-space-2)',
    borderBottom: '1px solid var(--bui-border-1)',
    '&:last-child': {
      borderBottom: 0,
    },
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
    },
  },
  row: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-3)',
    padding:
      'var(--bui-space-3) var(--bui-space-2) var(--bui-space-3) var(--bui-space-4)',
    color: 'var(--bui-fg-primary)',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'none',
    },
  },
  star: {
    flex: 'none',
    // A thumb's target at phone width (T22 §2.5), not the mouse's 32px.
    [PHONE_MEDIA]: {
      width: 44,
      height: 44,
    },
  },
  // The prototype's favorite star (#e8a400); the outline when not a favorite
  // stays quiet.
  starred: {
    color: '#e8a400',
  },
  // A group's heading over its own list, the artboard's `.org-head`.
  groupHead: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 'var(--bui-space-3)',
    rowGap: 2,
    marginBottom: 'var(--bui-space-3)',
  },
  // Name and description, then the facts: side by side where there is room,
  // the facts wrapping under the name at phone width.
  body: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 'var(--bui-space-4)',
    rowGap: 'var(--bui-space-1)',
  },
  main: {
    flex: '1 1 220px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  nameLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
    minWidth: 0,
  },
  status: {
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
  },
  facts: {
    flex: '0 1 auto',
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: 'var(--bui-space-4)',
    rowGap: 2,
    [PHONE_MEDIA]: {
      flexBasis: '100%',
    },
  },
  // Fixed-width fact columns line the rows up, as the prototype's do.
  fact: {
    flex: '0 0 150px',
    minWidth: 0,
    [PHONE_MEDIA]: {
      flex: '0 1 auto',
      overflowWrap: 'anywhere',
    },
  },
  // At phone width a name and a description wrap to two lines instead of
  // being cut to one (T22 P2): a phone has no hover to read the rest in a
  // tooltip.
  twoLines: TWO_LINES,
});

export type CustomizeAgentsPanelProps = {
  search: string;
};

/**
 * The Agents tab's facets (T49): the tenant an agent belongs to, the model it
 * runs on, its Harness, who created it and the person's favorites. The
 * environment is not one of them: the page's Environment select already
 * scopes the tab to one installation, and shows only where there is more than
 * one — a second control for the same thing would be two answers to one
 * question.
 *
 * @param harnesses the fleet's Harnesses ({@link agentHarnesses}); the
 *   Harness facet is offered only when there are two or more.
 * @param tenants how many tenants the rows belong to; the Tenant facet is
 *   offered only from two on, as the Harness one.
 * @param isMine whether the person created the row's agent: the "Created by"
 *   facet, which the bar shows only when some row is theirs.
 */
export function agentFacets(
  isFavorite: (id: string) => boolean,
  harnesses: ReadonlyMap<string, string | undefined>,
  {
    tenants = 0,
    isMine,
  }: { tenants?: number; isMine?: (row: AgentRow) => boolean } = {},
): CatalogFacet<AgentRow>[] {
  return [
    ...(tenants > 1
      ? [
          {
            id: 'tenant',
            label: 'Tenant',
            value: (row: AgentRow) => row.tenant,
          },
        ]
      : []),
    { id: 'model', label: 'Model', value: row => row.model || undefined },
    // Sanctioned exception to the bar's dropdown-of-one (T64): main's
    // `singleHarness` rule (#2858) — most fleets run every agent on one
    // Harness, so the Harness filter, like its per-agent fact, appears only
    // from two Harnesses on.
    ...(harnesses.size > 1
      ? [
          {
            id: 'harness',
            label: 'Harness',
            value: (row: AgentRow) => row.harness,
            optionLabel: (name: string) =>
              harnessLabel(name, harnesses.get(name)),
          },
        ]
      : []),
    ...(isMine
      ? [
          {
            id: 'createdBy',
            label: 'Created by',
            value: (row: AgentRow) => (isMine(row) ? 'me' : undefined),
            optionLabel: () => 'Me',
          },
        ]
      : []),
    {
      id: 'favorites',
      label: 'Favorites',
      value: row => (isFavorite(row.id) ? 'starred' : undefined),
      optionLabel: () => 'Starred',
    },
  ];
}

/**
 * One agent as the prototype's list row: avatar, name — with its state inline
 * only when it is not Ready — and what it is for, then its model, its Harness
 * and the environment when there is more than one of each, and its skills
 * and connectors.
 */
function AgentListItem({
  row,
  href,
  avatarUrl,
  showHarness,
  showTenant,
  showInstallation,
  isFavorite,
  onToggleFavorite,
  isPhone,
}: {
  row: AgentRow;
  href?: string;
  avatarUrl?: string;
  showHarness: boolean;
  /** More than one tenant in the list: each row names its own. */
  showTenant: boolean;
  showInstallation: boolean;
  /** The phone layout: texts wrap rather than truncate behind a `title`. */
  isPhone: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const classes = useStyles();
  const status = agentStatus(row);
  const parts = agentParts(row);
  // `undefined`, never `false`, on a phone: bui writes `truncate={false}` as
  // `data-truncate="false"`, which its stylesheet still truncates.
  const truncate = isPhone ? undefined : true;
  const facts: {
    key: string;
    text: string;
    label: string;
    /** The tooltip's fuller wording of `text`; `text` itself by default. */
    detail?: string;
  }[] = [
    { key: 'model', text: row.model ?? '', label: 'Model' },
    // The title, as main's Harness column led with; the name joins it in the
    // tooltip.
    ...(showHarness
      ? [
          {
            key: 'harness',
            text: row.harnessTitle ?? row.harness ?? '',
            label: 'Harness',
            detail: row.harness && harnessLabel(row.harness, row.harnessTitle),
          },
        ]
      : []),
    { key: 'parts', text: parts, label: 'Skills and connectors' },
    ...(showTenant && row.tenant
      ? [{ key: 'tenant', text: row.tenant, label: 'Tenant' }]
      : []),
    ...(showInstallation
      ? [{ key: 'installation', text: row.installation, label: 'Environment' }]
      : []),
  ];

  const content: ReactNode = (
    <>
      <AgentAvatar
        size="medium"
        purpose="decoration"
        name={row.name}
        src={avatarUrl ?? ''}
      />
      <div className={classes.body}>
        <div className={classes.main}>
          <div className={classes.nameLine}>
            <Text
              as="span"
              variant="body-medium"
              weight="bold"
              truncate={truncate}
              className={isPhone ? classes.twoLines : undefined}
            >
              {row.name}
            </Text>
            {/* The state shows only when it needs a look, as in the
                prototype; a Ready agent's state is on its own page. The
                state keeps to its few words (T104): the reason is its
                tooltip, and the agent's page says it in full, which is where
                a phone reads it (the row is one link, so no hint button can
                sit in it). */}
            {status.tone !== 'success' && (
              <span className={classes.status} title={row.readinessMessage}>
                <StatusDot tone={status.tone} />
                <Text as="span" variant="body-small" color="secondary">
                  {status.label}
                </Text>
              </span>
            )}
          </div>
          {row.description && (
            <Text
              as="span"
              variant="body-small"
              color="secondary"
              truncate={truncate}
              className={isPhone ? classes.twoLines : undefined}
              title={isPhone ? undefined : row.description}
            >
              {row.description}
            </Text>
          )}
        </div>
        <div className={classes.facts}>
          {facts.map(fact => (
            <Text
              key={fact.key}
              as="span"
              variant="body-small"
              color="secondary"
              truncate={truncate}
              className={classes.fact}
              title={
                fact.text
                  ? `${fact.label}: ${fact.detail ?? fact.text}`
                  : undefined
              }
            >
              {fact.text}
            </Text>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <li className={classes.item}>
      {href ? (
        <Link href={href} className={classes.row}>
          {content}
        </Link>
      ) : (
        <div className={classes.row}>{content}</div>
      )}
      <ButtonIcon
        className={classes.star}
        variant="tertiary"
        size="small"
        icon={
          isFavorite ? (
            <StarIcon fontSize="small" className={classes.starred} />
          ) : (
            <StarBorderIcon fontSize="small" />
          )
        }
        aria-pressed={isFavorite}
        aria-label={
          isFavorite
            ? `Remove ${row.name} from favorites`
            : `Add ${row.name} to favorites`
        }
        onPress={onToggleFavorite}
      />
    </li>
  );
}

/**
 * One group of rows: an optional heading with its count, then the bordered
 * list, windowed at {@link AGENTS_PAGE_SIZE} rows (`ShowMore`) so a group of
 * 300 renders 25 at a time and a group of 3 shows no paging at all.
 */
function AgentGroup({
  title,
  label,
  rows,
  renderRow,
}: {
  /** The visible heading; none when the list is the only group. */
  title?: string;
  /** The list's accessible name. */
  label: string;
  rows: AgentRow[];
  renderRow: (row: AgentRow) => ReactNode;
}) {
  const classes = useStyles();
  const headingId = useId();
  const list = (
    <ShowMore items={rows} initial={AGENTS_PAGE_SIZE} noun="agent">
      {page => (
        <ul className={classes.list} aria-label={label}>
          {page.map(renderRow)}
        </ul>
      )}
    </ShowMore>
  );
  if (!title) {
    return list;
  }
  return (
    <section aria-labelledby={headingId}>
      <div className={classes.groupHead}>
        <Text as="h2" id={headingId} variant="title-x-small">
          {title}
        </Text>
        <Text as="span" variant="body-small" color="secondary">
          {rows.length === 1 ? '1 agent' : `${rows.length} agents`}
        </Text>
      </div>
      {list}
    </section>
  );
}

/**
 * The Agents tab of the shell's Customize screen, in the prototype's
 * presentation: the helper banner pointing at the `generalInformation` meta
 * agent (when configured), the person's "Last used by you" cards, then the
 * rounded list of the agents in scope — the person's favorites (starred, per
 * person) in a group of their own on top — an avatar row each with what it is
 * for, its model and its parts, each row opening the agent's page. One list,
 * not grouped by tenant (D4); where the agents belong to more than one tenant,
 * each row names its tenant and the bar filters by it (giantswarm#36698, D6).
 * Must be mounted inside a `CustomizeDataProvider`.
 */
export function CustomizeAgentsPanel({ search }: CustomizeAgentsPanelProps) {
  const classes = useStyles();
  const {
    rows,
    installations,
    isLoading,
    isLoadingMore,
    hasInstallations,
    unreachableInstallations,
    noAccessInstallations,
    kagentMissing,
    kagentSwitchedOff,
    unknownPin,
    inventoryFailure,
  } = useAgents();
  const inventory = useInstallationInventory();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const isPhone = usePhoneLayout();
  const { isPinned: isFavorite, togglePin: toggleFavorite } =
    useFavoriteAgents();

  const searched = useMemo(() => searchAgents(rows, search), [rows, search]);
  const harnesses = useMemo(() => agentHarnesses(rows), [rows]);
  // Main's `singleHarness` rule (#2858): one Harness for every agent shows
  // neither the Harness fact nor its filter.
  const showHarness = harnesses.size > 1;
  const tenantCount = new Set(rows.map(row => row.tenant)).size;
  // "Created by me": the creator agent-manager recorded against the person as
  // kagent knows them on the agent's installation.
  const capabilitiesFor = useKagentCapabilitiesMap(installations);
  const isMine = useCallback(
    (row: AgentRow) =>
      row.createdBy !== undefined &&
      row.createdBy === capabilitiesFor(row.installation).subject,
    [capabilitiesFor],
  );
  const facets = useMemo(
    () => agentFacets(isFavorite, harnesses, { tenants: tenantCount, isMine }),
    [isFavorite, harnesses, tenantCount, isMine],
  );
  const filters = useCatalogFilters({ items: rows, searched, facets });
  // A Harness pick outlives its dropdown when the fleet settles on one
  // Harness; it would filter nothing yet still count as a filter in force.
  const { selection, select } = filters;
  const harnessPicked = (selection.harness?.length ?? 0) > 0;
  useEffect(() => {
    if (!showHarness && harnessPicked) {
      select('harness', []);
    }
  }, [showHarness, harnessPicked, select]);
  const visible = filters.filtered;
  const favorites = useMemo(
    () => visible.filter(row => isFavorite(row.id)),
    [visible, isFavorite],
  );
  const others = useMemo(
    () => visible.filter(row => !isFavorite(row.id)),
    [visible, isFavorite],
  );
  const showInstallation = new Set(rows.map(row => row.installation)).size > 1;
  const isNarrowed = search.trim() !== '' || filters.isFiltered;
  // A new search or filter starts each group again from its first page.
  const pageKey = `${search.trim()}|${filters.key}`;

  const renderRow = (row: AgentRow) => (
    <AgentListItem
      key={row.id}
      row={row}
      href={agentDetailRoute?.({
        installation: row.installation,
        namespace: row.namespace,
        name: row.technicalName,
      })}
      avatarUrl={buildAvatarUrl(row.installation, row.technicalName, {
        size: ROW_AVATAR_SIZE,
      })}
      showHarness={showHarness}
      showTenant={tenantCount > 1}
      showInstallation={showInstallation}
      isPhone={isPhone}
      isFavorite={isFavorite(row.id)}
      onToggleFavorite={() => {
        // A preference, like a pinned session: the StorageApi write is the
        // whole action, and a failed one leaves the star as it was.
        toggleFavorite(row.id).catch(() => {});
      }}
    />
  );

  let body;
  if (rows.length === 0 && unknownPin) {
    // A pin the portal does not know (a stale `?installation=` deep link): no
    // inventory to ask, and nothing else on the panel can say why it is empty.
    body = (
      <EmptyStateCard
        title="Unknown environment"
        description={`This portal knows no environment named “${unknownPin}”. Choose another environment.`}
      />
    );
  } else if (kagentMissing) {
    body = (
      // Every environment in scope answered without kagent: nothing can be
      // listed or created there, whatever else is still loading.
      <KagentMissingCard {...kagentMissing} />
    );
  } else if (isLoading) {
    body = <LoadingIndicator label="Reading your agents…" />;
  } else if (!hasInstallations) {
    body = (
      <EmptyStateCard
        title="No environments configured"
        description="Agents are read from your environments, and this portal knows none."
      />
    );
  } else if (rows.length === 0) {
    // The fleet has settled with nothing: `isLoading` holds only while no
    // row exists yet. Only a fleet that answered, holds no agent and has
    // somewhere to deploy to (`installations`, the environments in scope that
    // run kagent and are reachable) is invited to create one; anywhere else
    // the invitation would dead-end in the create form.
    if (
      unreachableInstallations.length > 0 ||
      (installations.length === 0 && inventoryFailure)
    ) {
      // Nothing could be read, or the environment could not be asked whether
      // it runs kagent, which is not nothing there: the read warning or the
      // inventory gate is the whole answer.
      body = null;
    } else if (noAccessInstallations.length > 0) {
      // Every namespace refused the person: no tenant binds them there, so
      // there is nothing to create a first agent in either.
      body = (
        <EmptyStateCard
          title="No agents for you yet"
          description={`You have access to no tenant’s agents on ${joinNames(
            noAccessInstallations,
          )}. ${ACCESS_GRANT_HINT}`}
        />
      );
    } else if (installations.length > 0) {
      body = <FirstAgentCard />;
    } else if (kagentSwitchedOff.length > 0) {
      body = (
        <EmptyStateCard
          title="No agents to list"
          description={describeKagentSwitchedOff(kagentSwitchedOff)}
        />
      );
    } else {
      // Environments in scope that run kagent exist only out of reach (their
      // access is not healthy), next to ones that answered without it.
      body = (
        <EmptyStateCard
          title="No agents to list"
          description="No environment this portal can reach runs kagent."
        />
      );
    }
  } else if (visible.length === 0) {
    body = (
      <CatalogNoMatch
        plural="agents"
        search={search}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clear}
      />
    );
  } else if (favorites.length === 0) {
    // No favorites in view: one list, no headings — the artboard's ungrouped
    // presentation.
    body = (
      <AgentGroup
        key={pageKey}
        label="Agents"
        rows={visible}
        renderRow={renderRow}
      />
    );
  } else {
    body = (
      <>
        <AgentGroup
          key={`favorites|${pageKey}`}
          title="Favorites"
          label="Favorite agents"
          rows={favorites}
          renderRow={renderRow}
        />
        {others.length > 0 && (
          <AgentGroup
            key={`others|${pageKey}`}
            title="Other agents"
            label="Agents"
            rows={others}
            renderRow={renderRow}
          />
        )}
      </>
    );
  }

  return (
    <Flex direction="column" gap="5">
      {/* Under the page's search, so the bar stays put when a pick hides the
          recent-agent cards. */}
      {!isLoading && (
        <CatalogFilterBar
          dimensions={filters.dimensions}
          onSelect={filters.select}
          onClear={filters.clear}
        />
      )}
      {/* The environment this tab reads could not be asked whether it runs
          kagent: said once, with the remedy, as `InstallationInventoryGate`
          says it on the Sessions list. */}
      {inventoryFailure && (
        <InventoryFailureGate
          failure={inventoryFailure}
          onRetry={inventory.refresh}
          context="Which environments run kagent is read through their Kubernetes API."
        />
      )}
      <UnreachableInstallationsAlert
        installations={unreachableInstallations}
        resourceName="agents"
        isLoading={isLoading}
      />
      <AgentsHelperBanner />
      {/* The person's recent agents, while the tab shows everything: a search
          or a filter narrows the list below, and the cards would not follow. */}
      {!isLoading && rows.length > 0 && !isNarrowed && (
        <SessionsDataProvider>
          <LastUsedAgents />
        </SessionsDataProvider>
      )}
      {rows.length > 0 ? (
        <Flex direction="column" gap="5" className={classes.listFrame}>
          {/* Rows are in, but more environments are still being read: a thin
              bar rather than a skeleton. */}
          {isLoadingMore && (
            <div className={classes.loadingMore}>
              <Progress aria-label="Loading more agents" />
            </div>
          )}
          {body}
        </Flex>
      ) : (
        body
      )}
    </Flex>
  );
}
