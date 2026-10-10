import {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Dialog, DialogHeader, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import SearchIcon from '@material-ui/icons/Search';

import { useCreateSession } from '../../hooks/useCreateSession';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { skillSource, uniqueSkills } from '../../lib/customize';
import { skillDetailPath } from '../../lib/skills';
import {
  agentDetailRouteRef,
  musterServersExternalRouteRef,
  sessionDetailRouteRef,
  skillsRouteRef,
} from '../../routes';
import { AgentPlatformProviders } from '../AgentPlatformProviders';
import { useAgents, type AgentRow } from '../AgentsDataProvider';
import { NewSessionDialog } from '../NewSessionDialog';
import { useSessions } from '../SessionsDataProvider';
import {
  buildPaletteGroups,
  isEditableTarget,
  isPaletteHotkey,
  PALETTE_FILTERS,
  portalSearchHref,
  type PaletteCandidate,
  type PaletteEntry,
  type PaletteFilter,
  type PaletteGroupId,
} from './helpers';
import { usePaletteConnectors } from './usePaletteConnectors';

const useStyles = makeStyles({
  // The Modal container. On a phone the palette is the screen: a floating
  // card at 375px leaves no room for results under the keyboard.
  dialog: {
    '@media (max-width: 599.95px)': {
      width: '100vw !important',
      minWidth: '100vw !important',
      maxWidth: '100vw !important',
      height: '100dvh',
      maxHeight: '100dvh !important',
      borderRadius: 0,
      margin: 0,
    },
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-3)',
    padding: 'var(--bui-space-3) var(--bui-space-4)',
    borderBottom: '1px solid var(--bui-border-1)',
    color: 'var(--bui-fg-secondary)',
  },
  input: {
    flex: '1 1 auto',
    minWidth: 0,
    border: 0,
    outline: 'none',
    background: 'transparent',
    font: 'inherit',
    fontSize: '1.0625rem',
    color: 'var(--bui-fg-primary)',
    '&::placeholder': {
      color: 'var(--bui-fg-secondary)',
    },
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-1_5, 6px)',
    padding: 'var(--bui-space-3) var(--bui-space-4) var(--bui-space-1)',
  },
  chip: {
    height: 28,
    padding: '0 11px',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 999,
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-primary)',
    font: 'inherit',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    // The shell's dark-chip pair (agent-shell.css); the hex fallbacks are the
    // same values, for the rare mount outside the shell's stylesheet.
    '&[aria-pressed="true"]': {
      background: 'var(--agent-shell-avatar-bg, #002645)',
      borderColor: 'var(--agent-shell-avatar-bg, #002645)',
      color: 'var(--agent-shell-avatar-fg, #ffffff)',
    },
  },
  results: {
    flex: '1 1 auto',
    minHeight: 0,
    maxHeight: 'min(420px, 60vh)',
    overflowY: 'auto',
    padding: 'var(--bui-space-1) var(--bui-space-2) var(--bui-space-2)',
    listStyle: 'none',
    margin: 0,
    '@media (max-width: 599.95px)': {
      maxHeight: 'none',
    },
  },
  groupList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  groupLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'var(--bui-space-2)',
    padding: 'var(--bui-space-3) var(--bui-space-2) var(--bui-space-1)',
  },
  option: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--bui-space-3)',
    padding: 'var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    cursor: 'pointer',
    '&[aria-selected="true"]': {
      background: 'var(--agent-shell-rail-item-hover, var(--bui-bg-neutral-2))',
    },
  },
  optionText: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  truncated: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  meta: {
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: 'var(--bui-space-5) var(--bui-space-4)',
  },
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-4)',
    padding: 'var(--bui-space-2) var(--bui-space-4)',
    borderTop: '1px solid var(--bui-border-1)',
  },
  kbd: {
    font: 'inherit',
    fontSize: '0.71875rem',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 5,
    padding: '1px 5px',
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-secondary)',
  },
});

export type CommandPaletteProps = {
  /**
   * Renders the element that opens the palette — the rail's Search item on
   * desktop, the bottom bar's on mobile. The palette itself renders in a
   * modal portal, so the trigger's place in the DOM is all the caller styles.
   */
  renderTrigger: (open: () => void) => ReactNode;
};

/** The id of the pseudo-entry that hands the query to the classic search. */
const PORTAL_SEARCH_ID = 'portal-search';

/** A session's palette meta: "Today", or a short date. */
function sessionDate(createdAt: string | undefined): string | undefined {
  if (!createdAt) {
    return undefined;
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toDateString() === new Date().toDateString()
    ? 'Today'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Whether this runs on a platform whose palette key is ⌘ rather than Ctrl. */
function isApplePlatform(): boolean {
  return /mac|iphone|ipad|ipod/i.test(
    typeof navigator === 'undefined' ? '' : navigator.platform,
  );
}

/**
 * The ⌘K command palette (decision W4): a client-side search over the data
 * the shell already reads — session titles, agents, skills and connectors —
 * plus a way out to the classic portal-wide search. Session *content* is not
 * searched (gap G6): titles and metadata only.
 *
 * Opens on ⌘K / Ctrl+K and through the trigger the caller renders. The
 * hotkey is deliberately narrow: it only fires while the document root
 * carries `data-agent-shell` (the mark the shell toggles per location), and
 * never from inside an input, textarea or contenteditable — classic pages
 * and typing stay untouched.
 *
 * The fleet-wide data providers mount only while the palette (or its session
 * composer) is open, so opening it is what fires the list queries; they share
 * the plugin's query-client singleton, so everything a shell page has already
 * read is served from cache. Opening the palette reports no page view — it is
 * an overlay, not a navigation.
 */
export function CommandPalette({ renderTrigger }: CommandPaletteProps) {
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const [isOpen, setOpen] = useState(false);
  const [composerAgent, setComposerAgent] = useState<AgentRow | undefined>(
    undefined,
  );

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteHotkey(event)) {
        return;
      }
      if (document.documentElement.dataset.agentShell === undefined) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Unbound when the Agent Platform page is disabled — then there is nothing
  // to search and nowhere to go, so no trigger either (like RecentSessions).
  if (!sessionDetailRoute) {
    return null;
  }

  return (
    <>
      {renderTrigger(open)}
      {(isOpen || composerAgent) && (
        <AgentPlatformProviders>
          {isOpen && (
            <PaletteDialog
              onClose={close}
              onStartWithAgent={agent => {
                setOpen(false);
                setComposerAgent(agent);
              }}
            />
          )}
          {composerAgent && (
            <PaletteSessionComposer
              agent={composerAgent}
              onClose={() => setComposerAgent(undefined)}
            />
          )}
        </AgentPlatformProviders>
      )}
    </>
  );
}

/**
 * The composer for "start a session with this agent" (⌘↵ on an agent
 * result): the same dialog + handoff the agent detail page and the skill
 * Evaluate flow use. The create is tracked with its own entry point,
 * `searchPalette`.
 */
function PaletteSessionComposer({
  agent,
  onClose,
}: {
  agent: AgentRow;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const { rows, isLoading, isLoadingMore } = useAgents();
  const { createSession, isCreating, error, reset } =
    useCreateSession('searchPalette');

  const onStart = useCallback(
    async (chosen: AgentRow, prompt: string) => {
      let sessionId: string;
      try {
        sessionId = await createSession({ agent: chosen, prompt });
      } catch {
        // Left to the dialog, which stays open and shows the hook's error.
        return;
      }
      const href = sessionDetailRoute?.({
        installation: chosen.installation,
        sessionId,
      });
      if (!href) {
        onClose();
        return;
      }
      // The prompt travels with the navigation and is sent by the session
      // detail page — see "Starting a session" in docs/agent-platform.md.
      navigate(href, {
        state: {
          [NEW_SESSION_STATE_KEY]: {
            text: prompt,
            agentNamespace: chosen.namespace,
            agentName: chosen.technicalName,
          },
        },
      });
      onClose();
    },
    [createSession, navigate, onClose, sessionDetailRoute],
  );

  return (
    <NewSessionDialog
      isOpen
      onOpenChange={dialogOpen => {
        if (!dialogOpen) {
          reset();
          onClose();
        }
      }}
      agents={rows}
      isLoadingAgents={isLoading || isLoadingMore}
      defaultAgent={agent}
      isStarting={isCreating}
      error={error?.message}
      onStart={onStart}
    />
  );
}

function PaletteDialog({
  onClose,
  onStartWithAgent,
}: {
  onClose: () => void;
  onStartWithAgent: (agent: AgentRow) => void;
}) {
  const classes = useStyles();
  const navigate = useNavigate();
  const baseId = useId();

  const agents = useAgents();
  const sessions = useSessions();
  const skillCatalog = useSkillCatalog();
  const connectors = usePaletteConnectors(agents.installations);

  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const skillsRoute = useRouteRef(skillsRouteRef);
  const serversRoute = useRouteRef(musterServersExternalRouteRef);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PaletteFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const trimmedQuery = query.trim();

  const candidates = useMemo<
    Partial<Record<PaletteGroupId, PaletteCandidate[]>>
  >(() => {
    const sessionCandidates: PaletteCandidate[] = sessions.rows.map(row => ({
      id: `session:${row.id}`,
      title: row.title,
      description: row.agentName ? `with ${row.agentName}` : undefined,
      meta: sessionDate(row.createdAt),
      href: sessionDetailRoute
        ? sessionDetailRoute({
            installation: row.installation,
            sessionId: row.sessionId,
          })
        : '',
      // Titles and metadata only: session content is not searchable (G6).
      haystack: [row.title, row.agentName],
    }));

    const agentCandidates: PaletteCandidate[] = agents.rows.map(row => ({
      id: `agent:${row.id}`,
      title: row.name,
      description: row.description || undefined,
      meta: row.installation,
      href: agentDetailRoute
        ? agentDetailRoute({
            installation: row.installation,
            namespace: row.namespace,
            name: row.technicalName,
          })
        : '',
      agent: row,
      haystack: [row.name, row.description],
    }));

    const skillCandidates: PaletteCandidate[] = uniqueSkills(
      skillCatalog.skills,
    ).flatMap(skill => {
      const detailPath = skillDetailPath(skill);
      // A skill outside github.com has no detail page to open.
      if (!detailPath || !skillsRoute) {
        return [];
      }
      return [
        {
          id: `skill:${skill.repoUrl}#${skill.path}`,
          title: skill.name,
          description: skill.description || undefined,
          meta: skillSource(skill),
          href: `${skillsRoute()}/${detailPath}`,
          haystack: [skill.name, skill.description],
        },
      ];
    });

    const connectorCandidates: PaletteCandidate[] = serversRoute
      ? connectors.rows.map(connector => ({
          id: `connector:${connector.page}`,
          title: connector.page,
          meta:
            connector.installations.length > 1
              ? `${connector.installations.length} environments`
              : connector.installations[0],
          href: `${serversRoute()}/${encodeURIComponent(connector.page)}`,
          haystack: [connector.page],
        }))
      : [];

    return {
      sessions: sessionCandidates.filter(candidate => candidate.href),
      agents: agentCandidates.filter(candidate => candidate.href),
      skills: skillCandidates,
      connectors: connectorCandidates,
    };
  }, [
    sessions.rows,
    agents.rows,
    skillCatalog.skills,
    connectors.rows,
    sessionDetailRoute,
    agentDetailRoute,
    skillsRoute,
    serversRoute,
  ]);

  const groups = useMemo(
    () => buildPaletteGroups(candidates, trimmedQuery, filter),
    [candidates, trimmedQuery, filter],
  );

  // What the arrow keys walk: the groups' rows, then the portal-search row.
  const flatEntries = useMemo<PaletteEntry[]>(() => {
    const entries = groups.flatMap(group => group.entries);
    if (trimmedQuery) {
      entries.push({
        id: PORTAL_SEARCH_ID,
        title: `Search the whole portal for “${trimmedQuery}”`,
        href: portalSearchHref(trimmedQuery),
      });
    }
    return entries;
  }, [groups, trimmedQuery]);

  // A new query or chip starts the selection over at the top.
  useEffect(() => {
    setActiveIndex(0);
  }, [trimmedQuery, filter]);

  const boundedIndex = Math.min(
    activeIndex,
    Math.max(0, flatEntries.length - 1),
  );
  const activeEntry: PaletteEntry | undefined = flatEntries[boundedIndex];

  const optionId = (entry: PaletteEntry) => `${baseId}-${entry.id}`;

  const openEntry = useCallback(
    (entry: PaletteEntry) => {
      navigate(entry.href);
      onClose();
    },
    [navigate, onClose],
  );

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index =>
        Math.min(index + 1, Math.max(0, flatEntries.length - 1)),
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Enter') {
      if (!activeEntry) {
        return;
      }
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        if (activeEntry.agent) {
          onStartWithAgent(activeEntry.agent);
        }
        return;
      }
      openEntry(activeEntry);
    }
  };

  const isLoadingAny =
    agents.isLoading ||
    agents.isLoadingMore ||
    sessions.isLoading ||
    sessions.isLoadingMore ||
    skillCatalog.isLoading ||
    connectors.isLoading;

  const listboxId = `${baseId}-listbox`;
  const inputLabel = 'Search sessions, agents, skills and connectors';
  const mod = isApplePlatform() ? '⌘' : 'Ctrl';

  // Honest about an empty result; the portal-search row below stays either
  // way, since the classic search may still know the term.
  let emptyText: string | undefined;
  if (groups.length === 0) {
    if (trimmedQuery) {
      emptyText = `Nothing in your sessions, agents, skills or connectors matches “${trimmedQuery}”.`;
    } else if (isLoadingAny) {
      emptyText = 'Loading your sessions, agents, skills and connectors…';
    } else {
      emptyText =
        'Nothing to search yet. Sessions, agents, skills and connectors show up here as they exist.';
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={dialogOpen => {
        if (!dialogOpen) {
          onClose();
        }
      }}
      width="min(92vw, 660px)"
      className={classes.dialog}
    >
      {/* Titles the dialog (react-aria's Heading slot) and carries the close
          button; the search field itself cannot label a modal. */}
      <DialogHeader>Search</DialogHeader>
      <div className={classes.body}>
        <div className={classes.searchRow}>
          <SearchIcon fontSize="small" />
          <input
            className={classes.input}
            role="combobox"
            aria-label={inputLabel}
            aria-expanded
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeEntry ? optionId(activeEntry) : undefined
            }
            placeholder="Search sessions, agents, skills, connectors…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            // The dialog exists to type into; react-aria focuses the dialog
            // container, so without this the field has to be clicked first.
            // Same exception, same reason, as NewSessionDialog.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
        <div className={classes.chips} role="group" aria-label="Filter results">
          {PALETTE_FILTERS.map(chip => (
            <button
              key={chip.id}
              type="button"
              className={classes.chip}
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        {emptyText && (
          <div className={classes.empty}>
            <Text as="p" variant="body-medium" color="secondary">
              {emptyText}
            </Text>
          </div>
        )}
        {flatEntries.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Results"
            className={classes.results}
          >
            {groups.map(group => (
              <li key={group.id} role="presentation">
                <div className={classes.groupLabel}>
                  <Text variant="body-x-small" weight="bold" color="secondary">
                    {group.label}
                  </Text>
                  {group.moreCount > 0 && (
                    <Text variant="body-x-small" color="secondary">
                      +{group.moreCount} more
                    </Text>
                  )}
                </div>
                <ul role="presentation" className={classes.groupList}>
                  {group.entries.map(entry => (
                    <PaletteOption
                      key={entry.id}
                      entry={entry}
                      id={optionId(entry)}
                      isActive={activeEntry?.id === entry.id}
                      onActivate={() =>
                        setActiveIndex(
                          flatEntries.findIndex(each => each.id === entry.id),
                        )
                      }
                      onOpen={() => openEntry(entry)}
                    />
                  ))}
                </ul>
              </li>
            ))}
            {trimmedQuery && (
              <li key={PORTAL_SEARCH_ID} role="presentation">
                <div className={classes.groupLabel}>
                  <Text variant="body-x-small" weight="bold" color="secondary">
                    Everything else
                  </Text>
                </div>
                <ul role="presentation" className={classes.groupList}>
                  {flatEntries
                    .filter(entry => entry.id === PORTAL_SEARCH_ID)
                    .map(entry => (
                      <PaletteOption
                        key={entry.id}
                        entry={entry}
                        id={optionId(entry)}
                        isActive={activeEntry?.id === entry.id}
                        onActivate={() =>
                          setActiveIndex(flatEntries.length - 1)
                        }
                        onOpen={() => openEntry(entry)}
                      />
                    ))}
                </ul>
              </li>
            )}
          </ul>
        )}
        <div className={classes.footer}>
          <Text variant="body-x-small" color="secondary">
            <kbd className={classes.kbd}>↑</kbd>{' '}
            <kbd className={classes.kbd}>↓</kbd> move
          </Text>
          <Text variant="body-x-small" color="secondary">
            <kbd className={classes.kbd}>↵</kbd> open
          </Text>
          {activeEntry?.agent && (
            <Text variant="body-x-small" color="secondary">
              <kbd className={classes.kbd}>{mod}</kbd>{' '}
              <kbd className={classes.kbd}>↵</kbd> start a session with this
              agent
            </Text>
          )}
          {isLoadingAny && (
            <Text variant="body-x-small" color="secondary">
              Some results are still loading…
            </Text>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function PaletteOption({
  entry,
  id,
  isActive,
  onActivate,
  onOpen,
}: {
  entry: PaletteEntry;
  id: string;
  isActive: boolean;
  onActivate: () => void;
  onOpen: () => void;
}) {
  const classes = useStyles();
  return (
    // The listbox pattern: focus stays in the input, the active option is
    // pointed at with aria-activedescendant, so options are not tab stops.
    <li
      id={id}
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      className={classes.option}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          onOpen();
        }
      }}
      onMouseMove={onActivate}
    >
      <span className={classes.optionText}>
        <Text variant="body-medium" className={classes.truncated}>
          {entry.title}
        </Text>
        {entry.description && (
          <Text
            variant="body-x-small"
            color="secondary"
            className={classes.truncated}
          >
            {entry.description}
          </Text>
        )}
      </span>
      {entry.meta && (
        <Text variant="body-x-small" color="secondary" className={classes.meta}>
          {entry.meta}
        </Text>
      )}
    </li>
  );
}
