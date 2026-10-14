import {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { ButtonIcon, Dialog, DialogHeader, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import SearchIcon from '@material-ui/icons/Search';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import {
  PHONE_MEDIA,
  stopRowPress,
  usePhoneLayout,
  useTouchInput,
} from '@giantswarm/backstage-plugin-ui-react';

import { useCreateSession } from '../../hooks/useCreateSession';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { skillSource, uniqueSkills } from '../../lib/customize';
import { skillDetailPath } from '../../lib/skills';
import {
  agentDetailRouteRef,
  musterServersExternalRouteRef,
  musterWorkflowDetailExternalRouteRef,
  sessionDetailRouteRef,
  sessionsRouteRef,
  skillsRouteRef,
} from '../../routes';
import { AgentPlatformProviders } from '../AgentPlatformProviders';
import { useAgents, type AgentRow } from '../AgentsDataProvider';
import {
  NewSessionDialog,
  PHONE_FULL_SCREEN_DIALOG,
} from '../NewSessionDialog';
import { useSessions } from '../SessionsDataProvider';
import { sessionsListSearch } from '../SessionsTable/filters';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { EnterKey } from '../EnterKey';
import { Kbd } from '../Kbd';
import {
  buildPaletteGroups,
  isEditableTarget,
  isPaletteHotkey,
  type PaletteCandidate,
  type PaletteEntry,
  type PaletteFilter,
  type PaletteGroupId,
  visiblePaletteFilters,
} from './helpers';
import { usePaletteConnectors } from './usePaletteConnectors';
import { usePaletteModels } from './usePaletteModels';
import { usePaletteWorkflows } from './usePaletteWorkflows';

const useStyles = makeStyles({
  // The Modal container. On a phone the palette is the screen: a floating
  // card at 375px leaves no room for results under the keyboard.
  dialog: PHONE_FULL_SCREEN_DIALOG,
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
    [PHONE_MEDIA]: {
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
  // The touch path to an agent's second action (T22 B20): a tap on the row
  // opens the agent, ⌘↵ has no key to press. Centred on the row, and a 44px
  // target — it is not the full-width row.
  startSession: {
    flex: 'none',
    alignSelf: 'center',
    display: 'inline-flex',
    '& button': {
      minWidth: 44,
      minHeight: 44,
    },
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
});

export type CommandPaletteProps = {
  /**
   * Renders the element that opens the palette — the rail's Search item on
   * desktop, the bottom bar's on mobile. The palette itself renders in a
   * modal portal, so the trigger's place in the DOM is all the caller styles.
   */
  renderTrigger: (open: () => void) => ReactNode;
};

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
 * the shell already reads — session titles, agents, skills, connectors,
 * models and workflows. It stays in the shell: no result is a no-result
 * state, not a hop to the classic portal search (M18). Session *content* is
 * not searched (gap G6): titles and metadata only.
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
  const touch = useTouchInput();
  const isPhone = usePhoneLayout();
  // ⌘↵ has no key on a phone; a button on the agent's row stands in for it.
  // A desktop keeps the key, and its hint in the footer.
  const offersStartButton = touch || isPhone;

  const agents = useAgents();
  const sessions = useSessions();
  const skillCatalog = useSkillCatalog();
  const connectors = usePaletteConnectors(agents.installations);
  const models = usePaletteModels();
  const workflows = usePaletteWorkflows(agents.installations);

  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const skillsRoute = useRouteRef(skillsRouteRef);
  const serversRoute = useRouteRef(musterServersExternalRouteRef);
  const { modelDetail: modelDetailRoute } = useCustomizePaths();
  const workflowDetailRoute = useRouteRef(musterWorkflowDetailExternalRouteRef);
  const sessionsRoute = useRouteRef(sessionsRouteRef);

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

    const modelCandidates: PaletteCandidate[] = modelDetailRoute
      ? models.rows.map(model => ({
          id: `model:${model.id}`,
          title: model.displayName,
          description: model.description,
          meta: model.installation,
          href: modelDetailRoute({
            installation: model.installation,
            namespace: model.namespace,
            name: model.name,
          }),
          haystack: [model.displayName, model.name, model.description],
        }))
      : [];

    const workflowCandidates: PaletteCandidate[] = workflowDetailRoute
      ? workflows.rows.map(workflow => ({
          id: `workflow:${workflow.installation}/${workflow.name}`,
          title: workflow.name,
          description: workflow.description,
          meta: workflow.installation,
          href: `${workflowDetailRoute({
            name: workflow.name,
          })}?installation=${encodeURIComponent(workflow.installation)}`,
          haystack: [workflow.name, workflow.description],
        }))
      : [];

    return {
      sessions: sessionCandidates.filter(candidate => candidate.href),
      agents: agentCandidates.filter(candidate => candidate.href),
      skills: skillCandidates,
      connectors: connectorCandidates,
      models: modelCandidates,
      workflows: workflowCandidates,
    };
  }, [
    sessions.rows,
    agents.rows,
    skillCatalog.skills,
    connectors.rows,
    models.rows,
    workflows.rows,
    sessionDetailRoute,
    agentDetailRoute,
    skillsRoute,
    serversRoute,
    modelDetailRoute,
    workflowDetailRoute,
  ]);

  const groups = useMemo(
    () => buildPaletteGroups(candidates, trimmedQuery, filter),
    [candidates, trimmedQuery, filter],
  );
  const chips = visiblePaletteFilters(candidates, filter);

  // Where a group's "+N more" goes: that kind's own list, searching for the
  // same thing. The shell lists every other kind on its Customize tab.
  const moreHref = (group: PaletteGroupId): string | undefined => {
    if (group === 'sessions') {
      return sessionsRoute
        ? `${sessionsRoute()}${sessionsListSearch({ query: trimmedQuery })}`
        : undefined;
    }
    const search = trimmedQuery ? `?q=${encodeURIComponent(trimmedQuery)}` : '';
    return `${SHELL_CUSTOMIZE_PATH}/${group}${search}`;
  };

  // What the arrow keys walk: the groups' rows, in order.
  const flatEntries = useMemo<PaletteEntry[]>(
    () => groups.flatMap(group => group.entries),
    [groups],
  );

  const boundedIndex = Math.min(
    activeIndex,
    Math.max(0, flatEntries.length - 1),
  );
  const activeEntry: PaletteEntry | undefined = flatEntries[boundedIndex];

  const optionId = (entry: PaletteEntry) => `${baseId}-${entry.id}`;

  const listboxRef = useRef<HTMLUListElement>(null);
  // Set when the pointer picked the active row: that row is under the
  // pointer, so in view already, and scrolling would move the list under it.
  const selectedByPointer = useRef(false);
  const lastPointer = useRef<{ x: number; y: number }>();

  // Keeps the active row in view after a keyboard move, and when results
  // that arrive late shift what the active index points at (the active id
  // changes then too). Not on every new page of results: that would pull a
  // list the person scrolled with the wheel back to the highlight. Focus
  // stays in the input, so the browser never scrolls to the row by itself.
  // Before paint, so the list does not flash at the old offset.
  const activeId = activeEntry?.id;
  useLayoutEffect(() => {
    if (selectedByPointer.current) {
      selectedByPointer.current = false;
      return;
    }
    const listbox = listboxRef.current;
    const row = listbox?.querySelector('[role="option"][aria-selected="true"]');
    if (!listbox || !row) {
      return;
    }
    // A group's first row brings its heading along.
    const heading = row.previousElementSibling
      ? null
      : row.parentElement?.previousElementSibling;
    scrollListTo(listbox, heading ?? row, row);
  }, [activeId]);

  // A new query or chip starts the selection, and the list, over at the
  // top. In the handlers rather than an effect, so the new results paint
  // once, already reset.
  const resetSelection = () => {
    setActiveIndex(0);
    selectedByPointer.current = false;
    if (listboxRef.current) {
      listboxRef.current.scrollTop = 0;
    }
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim() !== trimmedQuery) {
      resetSelection();
    }
  };

  const onFilterChange = (next: PaletteFilter) => {
    setFilter(next);
    if (next !== filter) {
      resetSelection();
    }
  };

  // Hover selects too, but only when the pointer itself moved: browsers send
  // a mousemove when the list scrolls under a resting pointer, and that must
  // not take the highlight back from the keyboard.
  const onPointerOver = (index: number, event: ReactMouseEvent) => {
    const { clientX: x, clientY: y } = event;
    const last = lastPointer.current;
    lastPointer.current = { x, y };
    if ((last && last.x === x && last.y === y) || index === boundedIndex) {
      return;
    }
    selectedByPointer.current = true;
    setActiveIndex(index);
  };

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
      setActiveIndex(Math.min(boundedIndex + 1, flatEntries.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(0, boundedIndex - 1));
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
    connectors.isLoading ||
    models.isLoading ||
    workflows.isLoading;

  const listboxId = `${baseId}-listbox`;
  const inputLabel =
    'Search sessions, agents, skills, connectors, models and workflows';
  const mod = isApplePlatform() ? '⌘' : 'Ctrl';

  // Honest about an empty result, and in the shell: no way out to the
  // classic portal search (M18).
  let emptyText: string | undefined;
  if (groups.length === 0) {
    if (trimmedQuery) {
      emptyText = `No results for “${trimmedQuery}”.`;
    } else if (isLoadingAny) {
      emptyText = 'Reading what there is to search…';
    } else {
      emptyText = 'Nothing to search yet.';
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
            placeholder="Search the agent platform…"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            // The dialog exists to type into; react-aria focuses the dialog
            // container, so without this the field has to be clicked first.
            // Same exception, same reason, as NewSessionDialog.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
        {/* Only the kinds there is something of, and none for a single kind
            (T39): a chip that filters down to nothing is noise. */}
        {chips.length > 0 && (
          <div
            className={classes.chips}
            role="group"
            aria-label="Filter results"
          >
            {chips.map(chip => (
              <button
                key={chip.id}
                type="button"
                className={classes.chip}
                aria-pressed={filter === chip.id}
                onClick={() => onFilterChange(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
        {emptyText && (
          <div className={classes.empty}>
            <Text as="p" variant="body-medium" color="secondary">
              {emptyText}
            </Text>
          </div>
        )}
        {flatEntries.length > 0 && (
          <ul
            ref={listboxRef}
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
                    <MoreLink
                      href={moreHref(group.id)}
                      count={group.moreCount}
                      label={group.label.toLocaleLowerCase()}
                      onOpen={onClose}
                    />
                  )}
                </div>
                <ul role="presentation" className={classes.groupList}>
                  {group.entries.map(entry => {
                    const agent = entry.agent;
                    return (
                      <PaletteOption
                        key={entry.id}
                        entry={entry}
                        id={optionId(entry)}
                        isActive={activeEntry?.id === entry.id}
                        onPointerOver={event =>
                          onPointerOver(
                            flatEntries.findIndex(each => each.id === entry.id),
                            event,
                          )
                        }
                        onOpen={() => openEntry(entry)}
                        onStartSession={
                          offersStartButton && agent
                            ? () => onStartWithAgent(agent)
                            : undefined
                        }
                      />
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {/* Key hints only where there are keys (T22 P7): on touch input the
            rows are tapped and an agent's row carries its own button. What
            is still loading is said either way. */}
        {(!touch || isLoadingAny) && (
          <div className={classes.footer}>
            {!touch && (
              <>
                <Text variant="body-x-small" color="secondary">
                  <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
                </Text>
                <Text variant="body-x-small" color="secondary">
                  <EnterKey /> open
                </Text>
                {activeEntry?.agent && (
                  <Text variant="body-x-small" color="secondary">
                    <Kbd>{mod}</Kbd> <EnterKey /> start a session with this
                    agent
                  </Text>
                )}
              </>
            )}
            {isLoadingAny && (
              <Text variant="body-x-small" color="secondary">
                Some results are still loading…
              </Text>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Scrolls `list`, and only it, by as little as it takes to show the span from
 * the top of `from` to the bottom of `to`. `Element.scrollIntoView` would
 * scroll every scrollable ancestor too: the dialog, and on iOS the viewport.
 */
function scrollListTo(list: HTMLElement, from: Element, to: Element) {
  const origin =
    list.getBoundingClientRect().top + list.clientTop - list.scrollTop;
  const top = from.getBoundingClientRect().top - origin;
  const bottom = to.getBoundingClientRect().bottom - origin;
  if (top < list.scrollTop) {
    list.scrollTop = top;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
}

/**
 * A group's "+N more": the kind's own list with the query, or plain text
 * when there is no such list to open.
 */
function MoreLink({
  href,
  count,
  label,
  onOpen,
}: {
  href: string | undefined;
  count: number;
  label: string;
  onOpen: () => void;
}) {
  if (!href) {
    return (
      <Text variant="body-x-small" color="secondary">
        +{count} more
      </Text>
    );
  }
  return (
    <Link
      href={href}
      variant="body-x-small"
      aria-label={`Show ${count} more ${label}`}
      onPress={onOpen}
    >
      +{count} more
    </Link>
  );
}

function PaletteOption({
  entry,
  id,
  isActive,
  onPointerOver,
  onOpen,
  onStartSession,
}: {
  entry: PaletteEntry;
  id: string;
  isActive: boolean;
  onPointerOver: (event: ReactMouseEvent) => void;
  onOpen: () => void;
  /** Offered on an agent's row on touch input: start a session with it. */
  onStartSession?: () => void;
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
      onMouseMove={onPointerOver}
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
      {onStartSession && (
        // Its presses are kept from the row, which would open the agent.
        <span
          role="presentation"
          className={classes.startSession}
          onPointerDown={stopRowPress}
          onPointerUp={stopRowPress}
          onClick={stopRowPress}
        >
          <ButtonIcon
            variant="tertiary"
            size="small"
            icon={<AddCircleOutlineIcon fontSize="small" />}
            aria-label={`Start a session with ${entry.title}`}
            onPress={onStartSession}
          />
        </span>
      )}
    </li>
  );
}
