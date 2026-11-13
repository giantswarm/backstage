import {
  type CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Progress } from '@backstage/core-components';
import { ButtonIcon, Flex, Link, Select, Text } from '@backstage/ui';
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
  tagsFacet,
  useCatalogFilters,
  usePhoneLayout,
  ROW_TAGS_MAX,
  TagList,
} from '@giantswarm/backstage-plugin-ui-react';

import { ConnectorLogoStack } from '@giantswarm/backstage-plugin-muster';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useAgentListConnectors } from '../../hooks/useAgentListConnectors';
import { useFavoriteAgents } from '../../hooks/useFavoriteAgents';
import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { useKagentCapabilitiesMap } from '../../hooks/useKagentCapabilities';
import { useStretchedLinkStyles } from '../../hooks/useStretchedLinkStyles';
import { useWarmNewAgentForm } from '../../hooks/useWarmNewAgentForm';
import {
  ACCESS_GRANT_HINT,
  creatorOf,
  ownerOf,
  OWNER_LABEL,
  tenantKindOf,
} from '../../lib/tenants';
import type { OrganizationDirectory } from '../../lib/organizations';
import { agentLastUsedAt } from '../../lib/recentAgents';
import type { ConnectorMark } from '../../lib/connectorMarks';
import type { AvatarSize } from '../../lib/agentAvatar';
import {
  AGENT_SORTS,
  type AgentSort,
  agentHarnesses,
  agentStatus,
  harnessLabel,
  searchAgents,
  sortAgents,
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
import { SessionsDataProvider, useSessions } from '../SessionsDataProvider';
import { ShowMore } from '../ShowMore';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';

/** At least twice the rendered 40px (bui's large avatar), for 2x displays. */
const ROW_AVATAR_SIZE: AvatarSize = 96;

/**
 * Rows rendered before *Show 25 more agents*, and how many each press adds:
 * an installation with 300 agents is a list nobody scrolls — the search above
 * the tab is how a specific agent is found.
 */
export const AGENTS_PAGE_SIZE = 25;

/** Connector logos a row shows, "+N" included. */
export const ROW_CONNECTORS_MAX = 3;

const NO_CONNECTORS: readonly ConnectorMark[] = [];

const NO_ROWS: AgentRow[] = [];

/** The list's order, remembered per browser like `useLastUsedAgent`'s pick. */
const SORT_STORAGE_KEY = 'gs-agent-platform-agents-sort';

/** "Sort" in the trigger, as the filter dropdowns name their field there. */
const SORT_NAME_STYLE: CSSProperties = {
  flexShrink: 0,
  whiteSpace: 'nowrap',
  color: 'var(--bui-fg-secondary)',
  fontSize: 'var(--bui-font-size-3)',
};

/**
 * The Sort trigger, as wide as its longest value ("Recently added") needs,
 * whatever is picked: a pick never changes where the filter bar wraps.
 */
const SORT_STYLE: CSSProperties = {
  flex: 'none',
  width: '11.5rem',
  marginLeft: 'auto',
};

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
  // The row opens the agent: its name is the link, whose hit area stretches
  // over the whole row (as `StackedRowList`'s does), so the star sits above
  // that area rather than inside a link. The hover tints the row, and the
  // connector logos' discs with it.
  item: {
    '--connector-stack-surface': 'var(--bui-bg-neutral-1)',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    paddingRight: 'var(--bui-space-2)',
    borderBottom: '1px solid var(--bui-border-1)',
    '&:last-child': {
      borderBottom: 0,
    },
    '&:hover': {
      '--connector-stack-surface': 'var(--bui-bg-neutral-2)',
      background: 'var(--bui-bg-neutral-2)',
    },
  },
  // Avatar, the name's column, the connectors' logos: roomy, one agent per
  // glance. On a phone the logos wrap under the text, in line with it.
  row: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    columnGap: 'var(--bui-space-4)',
    rowGap: 'var(--bui-space-2)',
    padding:
      'var(--bui-space-4) var(--bui-space-2) var(--bui-space-4) var(--bui-space-4)',
    color: 'var(--bui-fg-primary)',
    [PHONE_MEDIA]: {
      flexWrap: 'wrap',
    },
  },
  // Stretched over the row by `useStretchedLinkStyles`, which also draws the
  // focus ring round the row, as the hover does.
  nameLink: {
    color: 'inherit',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'none',
    },
  },
  // Lifted above the name link's stretched hit area: a press on it is its
  // own.
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
  // The name with its owner and state, what the agent is for, then
  // its tags and facts: three lines, each its own.
  body: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-1)',
  },
  // The name, its owner and its state on one baseline.
  nameLine: {
    display: 'flex',
    alignItems: 'baseline',
    columnGap: 'var(--bui-space-2)',
    rowGap: 2,
    minWidth: 0,
    // A phone's name takes two lines: its owner goes under it.
    [PHONE_MEDIA]: {
      flexWrap: 'wrap',
    },
  },
  // Whose agent it is, beside its name: never more than half the line, so a
  // long name and a long owner each keep some of it, and never
  // squeezed out by the name.
  // On a phone it shrinks to its line and wraps there instead.
  owner: {
    flex: 'none',
    maxWidth: '50%',
    [PHONE_MEDIA]: {
      flex: '0 1 auto',
      minWidth: 0,
      maxWidth: 'none',
      overflowWrap: 'anywhere',
    },
  },
  // On the name's baseline by its label; the dot stays centred on the label.
  status: {
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 'var(--bui-space-1)',
    '& > [data-tone]': {
      alignSelf: 'center',
    },
  },
  // The meta line under the description: tags, creator, Harness and
  // environment, wrapping where the line is short.
  facts: {
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 'var(--bui-space-3)',
    rowGap: 'var(--bui-space-1)',
  },
  // Tags sit under the name link's stretched hit area, so a press on one
  // opens the agent like the rest of the row.
  tags: {
    flex: '0 1 auto',
    minWidth: 0,
  },
  fact: {
    flex: '0 1 auto',
    minWidth: 0,
    [PHONE_MEDIA]: {
      overflowWrap: 'anywhere',
    },
  },
  // Three overlapping 24px logos wide on every row, so the rows' text and
  // stars line up whatever logos each has. The logos sit above the name
  // link's stretched hit area, so each one's tooltip opens. On a phone they
  // take a line of their own under the text, in line with it.
  connectors: {
    flex: '0 0 60px',
    display: 'flex',
    [PHONE_MEDIA]: {
      flexBasis: '100%',
      paddingLeft: 'calc(2.5rem + var(--bui-space-4))',
      '&:empty': {
        display: 'none',
      },
    },
  },
  // At phone width a name wraps to two lines instead of being cut to one
  // (T22 P2): a phone has no hover to read the rest in a tooltip. A
  // description takes two lines at every width.
  twoLines: TWO_LINES,
});

export type CustomizeAgentsPanelProps = {
  search: string;
};

/**
 * The Agents tab's facets (T49): the agent's owner (its tenant), the model it
 * runs on, its Harness, who created it, the person's favorites and its tags,
 * last as on every catalog tab. The environment is not one of them: the
 * page's Environment select already scopes the tab to one installation, and
 * shows only where there is more than one — a second control for the same
 * thing would be two answers to one question.
 *
 * The bar draws a facet only when it can narrow the list (one owner,
 * model or Harness among the agents that have one is no choice:
 * `catalogFilterDimensions`); an agent without a Harness is one not read yet,
 * not a second choice.
 *
 * @param harnesses the fleet's Harnesses ({@link agentHarnesses}), for how
 *   each option reads.
 * @param isMine whether the person created the row's agent: the "Created by"
 *   facet, which the bar shows only when some row is theirs.
 */
export function agentFacets(
  isFavorite: (id: string) => boolean,
  harnesses: ReadonlyMap<string, string | undefined>,
  { isMine }: { isMine?: (row: AgentRow) => boolean } = {},
): CatalogFacet<AgentRow>[] {
  return [
    { id: 'tenant', label: OWNER_LABEL, value: row => row.tenant },
    { id: 'model', label: 'Model', value: row => row.model || undefined },
    {
      id: 'harness',
      label: 'Harness',
      value: row => row.harness,
      optionLabel: name => harnessLabel(name, harnesses.get(name)),
    },
    ...(isMine
      ? [
          {
            id: 'createdBy',
            label: 'Created by',
            value: (row: AgentRow) => (isMine(row) ? 'me' : undefined),
            optionLabel: () => 'Me',
            missingIsChoice: true,
          },
        ]
      : []),
    {
      id: 'favorites',
      label: 'Favorites',
      value: row => (isFavorite(row.id) ? 'starred' : undefined),
      optionLabel: () => 'Starred',
      missingIsChoice: true,
    },
    // After the agent's own facets, as on every catalog tab.
    tagsFacet((row: AgentRow) => row.tags),
  ];
}

/** One of a row's facts, as text with its label in the tooltip. */
type AgentFact = {
  key: string;
  text: string;
  label: string;
  /** The tooltip's fuller wording of `text`; `text` itself by default. */
  detail?: string;
};

/**
 * A row's owner, beside its name, where the list's agents belong to more
 * than one tenant, in the words of the Owner filter's options (`ownerOf`). A
 * row has no labels, so an organization reads "Owner: acme", as the agent's
 * page has it, and is not taken for the environment among the facts.
 * An agent of the platform, the usual owner, has no text there: the rows
 * that name one stand out as an organization's (its page says "Platform",
 * and what that means). Another namespace already says what it is
 * (`namespace sre-team`).
 */
function ownerText(
  namespace: string,
  directory: OrganizationDirectory,
): string {
  const kind = tenantKindOf(namespace, directory);
  if (kind === 'platform') {
    return '';
  }
  return kind === 'organization'
    ? `${OWNER_LABEL}: ${ownerOf(namespace, directory)}`
    : ownerOf(namespace, directory);
}

/**
 * One agent as the prototype's list row: avatar; then the name — with its
 * owner and, only when it is not Ready, its state — what it is for, and
 * a line of its tags, creator, Harness and environment; then its connectors'
 * logos. The owner, Harness and environment show when the list has more
 * than one of each. The model and skills are technical detail, on the agent's
 * own page.
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
  connectors,
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
  /** Its connectors' logos, built once per installation for the list. */
  connectors: readonly ConnectorMark[];
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const { directory } = useOrganizationDirectory();
  const classes = useStyles();
  const stretched = useStretchedLinkStyles();
  const status = agentStatus(row);
  // `undefined`, never `false`, on a phone: bui writes `truncate={false}` as
  // `data-truncate="false"`, which its stylesheet still truncates.
  const truncate = isPhone ? undefined : true;
  const owner = showTenant ? ownerText(row.namespace, directory) : '';
  const ownerId = useId();
  const tagsId = useId();
  // The name's tooltip, with the owner beside it on a line of its own:
  // the name link's hit area covers the row, so the row shows this tooltip
  // wherever it is pointed at, the owner's text included, and either
  // can be read in full however it is cut. A phone has no hover.
  const nameTitle = isPhone
    ? undefined
    : [
        row.name,
        owner,
        row.tags.length > 0 ? `Tags: ${row.tags.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
  // The link names the agent; its owner and tags describe it.
  const describedBy =
    [owner && ownerId, row.tags.length > 0 && tagsId]
      .filter(Boolean)
      .join(' ') || undefined;
  const creator = creatorOf(
    row.createdBy,
    tenantKindOf(row.namespace, directory),
    row.createdByName,
  );
  const facts: AgentFact[] = [
    // Who made it, or the platform for an agent no one is recorded against
    // outside an organization.
    ...(creator
      ? [
          {
            key: 'createdBy',
            text: `by ${creator}`,
            label: 'Created by',
            // The email beside a name, in the tooltip.
            detail:
              row.createdBy && creator !== row.createdBy
                ? `${creator} (${row.createdBy})`
                : creator,
          },
        ]
      : []),
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
    ...(showInstallation
      ? [{ key: 'installation', text: row.installation, label: 'Environment' }]
      : []),
  ];

  const content: ReactNode = (
    <>
      <AgentAvatar
        size="large"
        purpose="decoration"
        name={row.name}
        src={avatarUrl ?? ''}
      />
      <div className={classes.body}>
        <div className={classes.nameLine}>
          {/* The link is the name itself, so a long name truncates with
              its ellipsis, as the text does without one. */}
          {href ? (
            <Link
              standalone
              href={href}
              variant="body-medium"
              weight="bold"
              truncate={truncate}
              title={nameTitle}
              aria-describedby={describedBy}
              className={[
                classes.nameLink,
                stretched.link,
                isPhone ? classes.twoLines : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {row.name}
            </Link>
          ) : (
            <Text
              as="span"
              variant="body-medium"
              weight="bold"
              truncate={truncate}
              title={nameTitle}
              className={isPhone ? classes.twoLines : undefined}
            >
              {row.name}
            </Text>
          )}
          {/* Whose agent it is, with the name rather than among the facts,
              which say what the agent is like; a platform agent's row has
              nothing here. Its tooltip is the name's (above): a title of its
              own would sit under the link's hit area. */}
          {owner && (
            <Text
              as="span"
              id={ownerId}
              variant="body-small"
              color="secondary"
              truncate={truncate}
              className={classes.owner}
            >
              {owner}
            </Text>
          )}
          {/* The state shows only when it needs a look, as in the
              prototype; a Ready agent's state is on its own page. The
              state keeps to its few words (T104): the reason is its
              tooltip, and the agent's page says it in full, which is where
              a phone reads it. */}
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
            className={classes.twoLines}
            title={isPhone ? undefined : row.description}
          >
            {row.description}
          </Text>
        )}
        <div className={classes.facts} data-testid="agent-facts">
          <TagList
            id={tagsId}
            tags={row.tags}
            max={ROW_TAGS_MAX}
            className={classes.tags}
          />
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
      {/* The test id: agentlab's tenants spec lines the rows' connectors
          up. */}
      <span className={classes.connectors} data-testid="agent-connectors">
        {connectors.length > 0 && (
          <ConnectorLogoStack
            connectors={connectors}
            max={ROW_CONNECTORS_MAX}
            aria-label={`Connectors of ${row.name}`}
            className={stretched.above}
          />
        )}
      </span>
    </>
  );

  return (
    <li className={classes.item}>
      <div className={classes.row}>{content}</div>
      <ButtonIcon
        className={`${classes.star} ${stretched.above}`}
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
 * for and its tags, each row opening the agent’s page. One list,
 * not grouped by tenant (D4); where the agents belong to more than one tenant,
 * each row names its tenant and the bar filters by it (giantswarm#36698, D6).
 * Must be mounted inside a `CustomizeDataProvider`.
 */
export function CustomizeAgentsPanel({ search }: CustomizeAgentsPanelProps) {
  const { rows, installations, isLoading } = useAgents();
  const { isPinned: isFavorite } = useFavoriteAgents();
  const list = useAgentListFilters(rows, installations, search, isFavorite);
  const [storedSort, setStoredSort] = useLocalStorageState<
    AgentSort | undefined
  >(SORT_STORAGE_KEY, { defaultValue: undefined });
  const pickedSort = AGENT_SORTS.find(option => option.id === storedSort)?.id;
  // The visit's order: the stored sort as the tab opens, else Name. A default
  // stored during the visit applies from the next one, so the list never
  // reorders under the person; a pick applies at once.
  const [sort, setSort] = useState<AgentSort>(() => pickedSort ?? 'name');
  const pick = useCallback(
    (next: AgentSort) => {
      setSort(next);
      setStoredSort(next);
    },
    [setStoredSort],
  );
  const storeDefault = useCallback(
    () => setStoredSort('lastUsed'),
    [setStoredSort],
  );
  // The recent-agent cards, while the tab shows everything: a search or a
  // filter narrows the list below, and the cards would not follow.
  const showCards = !isLoading && rows.length > 0 && !list.isNarrowed;
  // Each installation's session read mints its Dex token: read only while
  // something on the tab needs them (`sessionsNeeded`).
  return (
    <SessionsDataProvider
      enabled={sessionsNeeded({ showCards, sort, storedSort: pickedSort })}
    >
      <AgentsPanelContent
        search={search}
        list={list}
        showCards={showCards}
        sort={sort}
        storedSort={pickedSort}
        onSort={pick}
        onDefaultSort={storeDefault}
      />
    </SessionsDataProvider>
  );
}

/**
 * Whether the tab reads the person's sessions: for the "Last used by you"
 * cards, for the Last used sort, and while no sort is stored, to store Last
 * used as the default once the person has used an agent listed.
 */
export function sessionsNeeded({
  showCards,
  sort,
  storedSort,
}: {
  showCards: boolean;
  /** The visit's sort. */
  sort: AgentSort;
  /** The stored sort; none until a pick or the default is stored. */
  storedSort: AgentSort | undefined;
}): boolean {
  return showCards || sort === 'lastUsed' || storedSort === undefined;
}

/**
 * `rows` in the order of `sort`, held steady for the visit under Last used:
 * that order is taken once its first read is in (`ready`) and kept, so a
 * session or state that arrives later moves no row under the cursor; an agent
 * listed later follows the held ones. Name and Recently added depend on no
 * read and simply follow the rows. Undefined while Last used waits for its
 * first read. A pick reorders at once.
 */
function useSteadyOrder(
  allRows: readonly AgentRow[],
  rows: readonly AgentRow[],
  sort: AgentSort,
  lastUsedAt: ReadonlyMap<string, number>,
  ready: boolean,
): AgentRow[] | undefined {
  const [held, setHeld] = useState<{
    sort: AgentSort;
    rank: ReadonlyMap<string, number>;
  }>();
  const live = useMemo(
    () => rankOf(sortAgents(allRows, sort, lastUsedAt)),
    [allRows, sort, lastUsedAt],
  );
  const steady = sort === 'lastUsed';
  const rank = steady && held?.sort === sort ? held.rank : undefined;
  useEffect(() => {
    if (steady && ready && !rank) {
      setHeld({ sort, rank: live });
    } else if (!steady && held) {
      // A pick of another sort lets go: picking Last used again orders
      // afresh.
      setHeld(undefined);
    }
  }, [steady, ready, rank, sort, live, held]);

  return useMemo(() => {
    if (steady && !rank && !ready) {
      return undefined;
    }
    const order = rank ?? live;
    // An agent the held order does not know follows it, in the live order.
    const at = (row: AgentRow) =>
      order.get(row.id) ?? order.size + (live.get(row.id) ?? 0);
    return [...rows].sort((a, b) => at(a) - at(b));
  }, [rows, steady, rank, ready, live]);
}

/** Each row's place in `rows`, by id. */
function rankOf(rows: readonly AgentRow[]): ReadonlyMap<string, number> {
  return new Map(rows.map((row, index) => [row.id, index]));
}

type AgentListFilters = ReturnType<typeof useAgentListFilters>;

/**
 * The list's search and filter picks, and what they leave: read ahead of the
 * sessions, since whether the cards show decides whether they are read.
 */
function useAgentListFilters(
  rows: AgentRow[],
  installations: string[],
  search: string,
  isFavorite: (id: string) => boolean,
) {
  const searched = useMemo(() => searchAgents(rows, search), [rows, search]);
  const harnesses = useMemo(() => agentHarnesses(rows), [rows]);
  // Main's `singleHarness` rule (#2858): one Harness for every agent shows no
  // Harness fact; the filter follows the shared rule, which agrees.
  const showHarness = harnesses.size > 1;
  const tenantCount = new Set(rows.map(row => row.tenant)).size;
  // "Created by me": the creator agent-manager recorded against the person as
  // agent-manager names them (their email) on the agent's installation.
  const capabilitiesFor = useKagentCapabilitiesMap(installations);
  // Emails, compared as the IdP may write them in either case.
  const isMine = useCallback(
    (row: AgentRow) =>
      row.createdBy !== undefined &&
      row.createdBy.toLowerCase() ===
        capabilitiesFor(row.installation).caller?.toLowerCase(),
    [capabilitiesFor],
  );
  const facets = useMemo(
    () => agentFacets(isFavorite, harnesses, { isMine }),
    [isFavorite, harnesses, isMine],
  );
  const filters = useCatalogFilters({ items: rows, searched, facets });
  const isNarrowed = search.trim() !== '' || filters.isFiltered;
  return { filters, showHarness, tenantCount, isNarrowed };
}

function AgentsPanelContent({
  search,
  list: { filters, showHarness, tenantCount },
  showCards,
  sort,
  storedSort,
  onSort,
  onDefaultSort,
}: {
  search: string;
  list: AgentListFilters;
  showCards: boolean;
  sort: AgentSort;
  storedSort: AgentSort | undefined;
  /** A pick in the Sort select: the visit's sort, and stored. */
  onSort: (sort: AgentSort) => void;
  /** Stores Last used as the default, for the next visit. */
  onDefaultSort: () => void;
}) {
  const classes = useStyles();
  // The New agent form’s reads, started from here so its Owner field
  // does not arrive a moment after the form opens.
  useWarmNewAgentForm();
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
  // Last use is the person's own: sessions of an installation whose list is
  // not scoped to them are left out, as the "Last used by you" cards do.
  const {
    rows: sessions,
    notUserScopedInstallations,
    isLoading: sessionsLoading,
    isLoadingMore: sessionsLoadingMore,
  } = useSessions();
  const mySessions = useMemo(() => {
    const notMine = new Set(notUserScopedInstallations);
    return sessions.filter(session => !notMine.has(session.installation));
  }, [sessions, notUserScopedInstallations]);
  // Last used becomes the default once the person has used any agent
  // listed, decided on the sessions' starts alone: stored for the next visit,
  // never over a stored pick. This visit keeps its order.
  const usedAny = useMemo(() => {
    const started = agentLastUsedAt(mySessions);
    return rows.some(row => started.has(row.id));
  }, [mySessions, rows]);
  useEffect(() => {
    if (storedSort === undefined && usedAny) {
      onDefaultSort();
    }
  }, [storedSort, usedAny, onDefaultSort]);
  // A session's last turn is in its state, read only for the Last used sort
  // and the cards, which rank by it whatever the sort: each read costs its
  // installation a pass over its sessions.
  const readStates = showCards || sort === 'lastUsed';
  const sessionInstallations = useMemo(
    () =>
      readStates
        ? Array.from(new Set(mySessions.map(session => session.installation)))
        : [],
    [readStates, mySessions],
  );
  const { states: sessionStates, isComplete: statesRead } =
    useFleetSessionStates(sessionInstallations);
  const lastUsedAt = useMemo(
    () => agentLastUsedAt(mySessions, sessionStates),
    [mySessions, sessionStates],
  );
  // Last used's first read: every installation's sessions, then their states.
  const lastUsedRead = !sessionsLoading && !sessionsLoadingMore && statesRead;
  const ordered = useSteadyOrder(
    rows,
    filters.filtered,
    sort,
    lastUsedAt,
    lastUsedRead,
  );
  const visible = ordered ?? NO_ROWS;
  const favorites = useMemo(
    () => visible.filter(row => isFavorite(row.id)),
    [visible, isFavorite],
  );
  const others = useMemo(
    () => visible.filter(row => !isFavorite(row.id)),
    [visible, isFavorite],
  );
  const connectorsOf = useAgentListConnectors(rows);
  const showInstallation = new Set(rows.map(row => row.installation)).size > 1;
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
      connectors={connectorsOf.get(row.id) ?? NO_CONNECTORS}
      isFavorite={isFavorite(row.id)}
      onToggleFavorite={() => {
        // A preference, like a pinned session: the StorageApi write is the
        // whole action, and a failed one leaves the star as it was.
        toggleFavorite(row.id).catch(() => {});
      }}
    />
  );

  let body;
  // Whether `body` is the list: only a list gets the "loading more" bar over
  // it, so no other indicator ever shares the panel with it.
  let showsList = false;
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
    } else if (
      noAccessInstallations.length > 0 &&
      installations.every(name => noAccessInstallations.includes(name))
    ) {
      // Every namespace of every environment refused the person: no tenant
      // binds them anywhere, so there is nothing to create a first agent in
      // either.
      body = (
        <EmptyStateCard
          title="No agents for you yet"
          description={`You have access to no agents on ${joinNames(
            noAccessInstallations,
          )}. ${ACCESS_GRANT_HINT}`}
        />
      );
    } else if (installations.length > 0) {
      // The card asks agent-manager where the person may create.
      body = (
        <FirstAgentCard
          installations={installations.filter(
            name => !noAccessInstallations.includes(name),
          )}
        />
      );
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
  } else if (!ordered) {
    // Last used waits for its first read rather than reorder later
    // (`useSteadyOrder`).
    body = <LoadingIndicator label="Reading your agents…" />;
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
    showsList = true;
    body = (
      <AgentGroup
        key={pageKey}
        label="Agents"
        rows={visible}
        renderRow={renderRow}
      />
    );
  } else {
    showsList = true;
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
        // Top-aligned: once the filters wrap, Sort stays on their first row.
        <Flex align="start" gap="2" style={{ flexWrap: 'wrap' }}>
          <CatalogFilterBar
            dimensions={filters.dimensions}
            onSelect={filters.select}
            onClear={filters.clear}
          />
          {rows.length > 1 && (
            <Select
              aria-label="Sort agents"
              size="small"
              icon={
                <span aria-hidden style={SORT_NAME_STYLE}>
                  Sort
                </span>
              }
              options={AGENT_SORTS}
              value={sort}
              onChange={key => {
                if (key !== null) {
                  onSort(String(key) as AgentSort);
                }
              }}
              style={SORT_STYLE}
            />
          )}
        </Flex>
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
      {showCards && <LastUsedAgents states={sessionStates} />}
      {showsList ? (
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
