import { ReactNode, useId, useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { ButtonIcon, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import {
  type CatalogFacet,
  CatalogFilterBar,
  CatalogNoMatch,
  EmptyStateCard,
  LoadingIndicator,
  StatusDot,
  useCatalogFilters,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useFavoriteAgents } from '../../hooks/useFavoriteAgents';
import type { AvatarSize } from '../../lib/agentAvatar';
import { agentParts, agentStatus, searchAgents } from '../../lib/customize';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { AgentsHelperBanner } from '../AgentsHelperBanner';
import { type AgentRow, useAgents } from '../AgentsDataProvider';
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

/** Below this width the facts wrap under the name instead of in columns. */
const NARROW = '@media (max-width: 599px)';

const useStyles = makeStyles({
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
    [NARROW]: {
      flexBasis: '100%',
    },
  },
  // Fixed-width fact columns line the rows up, as the prototype's do.
  fact: {
    flex: '0 0 150px',
    minWidth: 0,
    [NARROW]: {
      flex: '0 1 auto',
    },
  },
});

export type CustomizeAgentsPanelProps = {
  search: string;
};

/**
 * The Agents tab's facets (T49): the model an agent runs on, and the person's
 * favorites. The environment is not one of them: the page's Environment
 * select already scopes the tab to one installation, and shows only where
 * there is more than one — a second control for the same thing would be two
 * answers to one question.
 */
export function agentFacets(
  isFavorite: (id: string) => boolean,
): CatalogFacet<AgentRow>[] {
  return [
    { id: 'model', label: 'Model', value: row => row.model || undefined },
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
 * only when it is not Ready — and what it is for, then its model, its skills
 * and connectors, and the environment when there is more than one.
 */
function AgentListItem({
  row,
  href,
  avatarUrl,
  showInstallation,
  isFavorite,
  onToggleFavorite,
}: {
  row: AgentRow;
  href?: string;
  avatarUrl?: string;
  showInstallation: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const classes = useStyles();
  const status = agentStatus(row);
  const parts = agentParts(row);
  const facts: { key: string; text: string; label: string }[] = [
    { key: 'model', text: row.model ?? '', label: 'Model' },
    { key: 'parts', text: parts, label: 'Skills and connectors' },
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
            <Text as="span" variant="body-medium" weight="bold" truncate>
              {row.name}
            </Text>
            {/* The state shows only when it needs a look, as in the
                prototype; a Ready agent's state is on its own page. */}
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
              truncate
              title={row.description}
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
              truncate
              className={classes.fact}
              title={fact.text ? `${fact.label}: ${fact.text}` : undefined}
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
 * for, its model and its parts, each row opening the agent's page. Global,
 * with no organization grouping or filter (D4): the Kubernetes namespace an
 * agent lives in is a technical detail of its own page. Must be mounted inside
 * a `CustomizeDataProvider`.
 */
export function CustomizeAgentsPanel({ search }: CustomizeAgentsPanelProps) {
  const { rows, isLoading, hasInstallations, unreachableInstallations } =
    useAgents();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const { isPinned: isFavorite, togglePin: toggleFavorite } =
    useFavoriteAgents();

  const searched = useMemo(() => searchAgents(rows, search), [rows, search]);
  const facets = useMemo(() => agentFacets(isFavorite), [isFavorite]);
  const filters = useCatalogFilters({ items: rows, searched, facets });
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
      showInstallation={showInstallation}
      isFavorite={isFavorite(row.id)}
      onToggleFavorite={() => {
        // A preference, like a pinned session: the StorageApi write is the
        // whole action, and a failed one leaves the star as it was.
        toggleFavorite(row.id).catch(() => {});
      }}
    />
  );

  let body;
  if (isLoading) {
    body = <LoadingIndicator label="Reading your agents…" />;
  } else if (!hasInstallations) {
    body = (
      <EmptyStateCard
        title="No environments configured"
        description="Agents are read from your environments, and this portal knows none."
      />
    );
  } else if (rows.length === 0) {
    body =
      unreachableInstallations.length > 0 ? null : (
        <EmptyStateCard
          title="No agents yet"
          description="Create an agent to start sessions with it."
        />
      );
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
      <UnreachableInstallationsAlert
        installations={unreachableInstallations}
        resourceName="Agents"
      />
      <AgentsHelperBanner />
      {/* The person's recent agents, while the tab shows everything: a search
          or a filter narrows the list below, and the cards would not follow. */}
      {!isLoading && rows.length > 0 && !isNarrowed && (
        <SessionsDataProvider>
          <LastUsedAgents />
        </SessionsDataProvider>
      )}
      {body}
    </Flex>
  );
}
