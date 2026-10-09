import {
  FormEvent,
  Key,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  ButtonIcon,
  Flex,
  Select,
  Text,
  TextAreaField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import { ComposerFrame } from '@giantswarm/backstage-plugin-ui-react';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import {
  isServingFailure,
  SERVED_MODEL_READINESS,
  SERVING_BACKEND_LABEL,
  type ClientServingSummary,
} from '../../lib/serving';
import type { AgentRow } from '../AgentsDataProvider';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';
import { isSendKey } from '../../lib/sendKey';
import { AgentAvatar } from '../AgentAvatar';
import { STABLE_CLASS_NAMES } from '../../lib/stableClassNames';

/** Rows the textarea shows before and after it expands. */
const COLLAPSED_ROWS = 1;
const EXPANDED_ROWS = 3;
const MAX_ROWS = 12;

/** Above this many agents the picker gets a search box. */
const SEARCHABLE_THRESHOLD = 8;

/** Matches the sessions table's row avatar: one line of text, 2× for hi-dpi. */
const OPTION_AVATAR_SIZE: AvatarSize = 48;

/** Id of the picker's last option, an action rather than an agent. */
const FOOTER_ACTION_ID = 'action:picker-footer';

const useStyles = makeStyles(theme => ({
  // bui sets a leading icon flush against the label, which suits a line icon but
  // not an avatar: a filled circle needs real space or the two read as one
  // smudged block. Applies to the trigger and the options alike.
  agentAvatar: {
    display: 'inline-flex',
    marginRight: theme.spacing(0.75),
  },
  // Kept compact rather than filling the row, matching the prototype: the prompt
  // is the hero and the knobs are secondary, which a full-width picker undoes.
  // It still shrinks on a narrow viewport.
  agentSelect: {
    maxWidth: 260,
    minWidth: 0,
  },
  '@global': {
    [`[role="listbox"] [data-key="${FOOTER_ACTION_ID}"]`]: {
      borderTopWidth: 1,
      borderTopStyle: 'solid',
      borderTopColor: 'var(--bui-border-1)',
      marginTop: 4,
    },
  },
}));

/**
 * Whether a session can be started with this agent.
 *
 * Exported so the picker and the callers that decide whether to *offer* a picker
 * at all share one predicate — a page withholding the composer on a different rule
 * than the picker filters on would either show an empty dropdown or hide a usable
 * one.
 */
export function isStartableAgent(agent: AgentRow): boolean {
  return agent.readiness === 'ready';
}

/**
 * The model state worth warning about before a session starts: the serving
 * layer says nothing answers for the agent's model (`notServing`) or it is
 * failing (`notReady`), so the first turn will fail. A warning, not a block —
 * kagent accepts the session either way, the model may be back by the time
 * the turn runs (a Load is in flight, an LLMInferenceService is rolling out), and
 * the fix is one click away on the Serving view. `idle` is deliberately not
 * one: the first turn loads the model.
 */
export function modelWarningFor(
  agent: AgentRow | undefined,
): ClientServingSummary | undefined {
  const serving = agent?.modelServing;
  return serving && isServingFailure(serving.readiness) ? serving : undefined;
}

/** What {@link NewSessionComposerProps.renderFooter} receives. */
export type NewSessionComposerFooterContext = {
  selectedAgent?: AgentRow;
  /** Selects a startable agent, as picking it in the picker would. */
  selectAgent: (agent: AgentRow) => void;
};

/** Prefix of the option ids in the Recent group, which repeat agents listed below it. */
const RECENT_OPTION_PREFIX = 'recent:';

/** An action listed last in the agent picker, e.g. a link to manage agents. */
export type NewSessionComposerPickerAction = {
  label: string;
  onAction: () => void;
};

export type NewSessionComposerProps = {
  /**
   * Agents to offer, in display order. Non-ready ones are filtered out unless
   * {@link NewSessionComposerProps.showUnavailable} is set.
   */
  agents: AgentRow[];
  /**
   * Lists non-ready agents too, as disabled options whose description is the
   * reason (`readinessMessage`). They are never selected.
   */
  showUnavailable?: boolean;
  /**
   * Groups the options by namespace, headed by the namespace, instead of by
   * installation.
   */
  groupByNamespace?: boolean;
  /**
   * Agent ids listed first, in this order, under a "Recent" heading, while the
   * search box is empty. Only read with `groupByNamespace`; ids not on offer
   * are skipped.
   */
  recentAgentIds?: string[];
  /** Gives the picker a search box whatever the number of agents. */
  searchable?: boolean;
  /** What the picker says while no agent is selected. */
  pickerPlaceholder?: string;
  /**
   * Listed last in the picker, after the agents and whatever the search:
   * choosing it runs the action and selects nothing.
   */
  pickerFooterAction?: NewSessionComposerPickerAction;
  /** The prompt the field starts with. */
  initialPrompt?: string;
  /** The field's placeholder for the selected agent, or for none. */
  promptPlaceholder?: (agent: AgentRow | undefined) => string;
  /** Rendered beside the agent picker. */
  renderPickerAccessory?: (agent: AgentRow | undefined) => ReactNode;
  /** Rendered under the composer. */
  renderFooter?: (context: NewSessionComposerFooterContext) => ReactNode;
  /** Called with the selected agent whenever it changes. */
  onSelectedAgentChange?: (agent: AgentRow | undefined) => void;
  /** Some installations are still being queried, so more agents may appear. */
  isLoadingAgents?: boolean;
  /**
   * Preselected agent. The sessions list passes the last one used; the agent
   * detail page passes the agent whose page it is.
   */
  defaultAgent?: AgentRow;
  /**
   * Start with a single-line text field and grow it on focus. The inline
   * placement uses this so the list below stays the main event; the dialog does
   * not, since it is already a deliberate act.
   */
  collapsible?: boolean;
  autoFocus?: boolean;
  isStarting: boolean;
  error?: string;
  /** Receives the chosen agent and the trimmed prompt. */
  onStart: (agent: AgentRow, prompt: string) => void;
};

/**
 * Longest description a picker option will carry.
 *
 * A bound is needed, not cosmetic. `readinessMessage` for a `failed` agent is
 * the controller's raw reconcile error, and a real one on an internal installation
 * is a 400-character
 * multi-line Postgres dial failure repeated twice — which turns one option into a
 * wall of text and pushes every other agent off the screen. The full message is on
 * the Agents tab and the agent's own page, where there is room for it.
 */
const DESCRIPTION_MAX_LENGTH = 100;

/**
 * The picker's label for an agent: its name, and -- when the offered agents
 * span more than one installation -- the installation it runs on, so the
 * selected value and every row tell two same-named agents apart. Exported for
 * the callers that mirror the label (tests, the sessions list's default).
 */
export function agentOptionLabel(
  agent: Pick<AgentRow, 'name' | 'installation'>,
  multipleInstallations: boolean,
): string {
  return multipleInstallations
    ? `${agent.name} · ${agent.installation}`
    : agent.name;
}

/**
 * One line, bounded: a description is free text and a couple on an internal
 * installation run to several sentences, which would push the other options
 * off the screen.
 */
function oneShortLine(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > DESCRIPTION_MAX_LENGTH
    ? `${collapsed.slice(0, DESCRIPTION_MAX_LENGTH).trimEnd()}…`
    : collapsed;
}

function labelMatches(label: string | undefined, query: string): boolean {
  return (label ?? '').toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * The picker's search, by label. The footer action stays in view while some
 * agent matches, so a search that matches none shows the empty state.
 */
function pickerSearchFilter(agentLabels: string[]) {
  return (option: { id: Key; label?: string }, query: string): boolean =>
    option.id === FOOTER_ACTION_ID
      ? agentLabels.some(label => labelMatches(label, query))
      : labelMatches(option.label, query);
}

/**
 * What to say about an agent under its name in the picker: for one that cannot
 * be started, why not.
 */
function describeAgent(agent: AgentRow): string | undefined {
  if (!isStartableAgent(agent)) {
    return agent.readinessMessage
      ? `Unavailable: ${oneShortLine(agent.readinessMessage)}`
      : 'Unavailable right now';
  }
  return agent.description ? oneShortLine(agent.description) : undefined;
}

/**
 * Start a new session: a prompt, an agent, and Start.
 *
 * The prompt is the only required input in the spec's sense — but an agent has to
 * be chosen too, because unlike the prototype we have no canonical
 * "general purpose" agent to fall back on, and a wrong guess here starts a paid
 * turn against an agent that can act on a cluster. So nothing starts until both
 * are in hand — but a missing agent is said, not just refused: Start stays
 * pressable, and pressing it (or Enter) names the gap and moves focus to the
 * picker, which a disabled button could not.
 *
 * The textarea's growth on focus is deliberately **one-way**: shrinking it on
 * blur would move the controls under the cursor, which reads as a glitch.
 *
 * Not built on {@link SessionComposer}, which sends into an existing session.
 * Both axes that component takes (`isAgentWorking`, `isFinished`) and all three
 * of its captions are meaningless before a session exists, and what the two
 * genuinely share — trim, the length bound, Enter-to-send — is a handful of
 * lines. An abstraction over two callers would cost more than it saves; the
 * length bound and the send key are imported rather than restated.
 */
export function NewSessionComposer({
  agents,
  showUnavailable = false,
  groupByNamespace = false,
  recentAgentIds,
  searchable,
  pickerPlaceholder = 'Select an agent',
  pickerFooterAction,
  initialPrompt,
  promptPlaceholder,
  renderPickerAccessory,
  renderFooter,
  onSelectedAgentChange,
  isLoadingAgents = false,
  defaultAgent,
  collapsible = false,
  autoFocus = false,
  isStarting,
  error,
  onStart,
}: NewSessionComposerProps) {
  const classes = useStyles();
  const buildAvatarUrl = useAgentAvatarUrl();
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [searchText, setSearchText] = useState('');
  const [expanded, setExpanded] = useState(!collapsible);
  const [agentMissing, setAgentMissing] = useState(false);
  const agentSelectRef = useRef<HTMLDivElement>(null);
  // Filtered once; every decision below reads the filtered list — what is offered,
  // what counts as a sole option, and whether a default is still valid.
  const offered = useMemo(() => agents.filter(isStartableAgent), [agents]);
  // What the picker lists: the startable agents, or every agent when the
  // unavailable ones are shown disabled.
  const listed = showUnavailable ? agents : offered;

  /**
   * The only agent on offer, when there is exactly one.
   *
   * A dropdown with a single item is not a choice, so it is preselected and the
   * control disabled. It still *names* the agent, which is worth keeping: the dialog
   * on an agent's page is about that agent, and seeing it named confirms the target
   * before you commit a paid turn to it. `InstallationSelect` makes the same call
   * for a one-installation fleet.
   */
  const soleAgent = offered.length === 1 ? offered[0] : undefined;

  // A `defaultAgent` only counts if it is actually on offer. `useLastUsedAgent`
  // already drops one that has gone or stopped being ready, but it resolves against
  // whichever installations have answered so far, so a stale one does reach here.
  // Without this check it would suppress the sole-agent selection *and* leave the
  // picker disabled: one agent available, none selected, no way to pick it.
  const offeredDefault =
    defaultAgent && offered.some(agent => agent.id === defaultAgent.id)
      ? defaultAgent
      : undefined;
  const effectiveDefault = offeredDefault ?? soleAgent;

  const [selectedId, setSelectedId] = useState<string | undefined>(
    effectiveDefault?.id,
  );

  // Adopt the default when it *arrives*, not only if it happened to be resolved at
  // mount. The fleet-wide list resolves progressively — `useAgents().isLoading`
  // goes false as soon as the first installation answers, while `isLoadingMore`
  // is still true for the rest — so a remembered agent on a slower installation is
  // routinely absent at mount and shows up a moment later. Seeding once meant the
  // picker still said "Select an agent", defeating the whole point of remembering.
  //
  // Render-phase, and gated on the user not having touched the picker, so this can
  // never overwrite a deliberate choice — including a deliberate *clearing*.
  const touched = useRef(false);
  const adopted = useRef(effectiveDefault?.id);
  if (
    !touched.current &&
    effectiveDefault &&
    adopted.current !== effectiveDefault.id
  ) {
    adopted.current = effectiveDefault.id;
    setSelectedId(effectiveDefault.id);
  }

  const selectedAgent = useMemo(
    () => offered.find(agent => agent.id === selectedId),
    [offered, selectedId],
  );
  // Derived rather than cleared on pick: an agent can also arrive by adopting a
  // late default, which the picker's change handler never sees.
  const showAgentMissing = agentMissing && !selectedAgent;

  // The same deterministic avatar the sessions table and the agent's own page
  // show, so one agent looks the same everywhere. Seeded from the technical name,
  // not the display name.
  const renderAvatar = useCallback(
    (agent: AgentRow) => (
      <span className={classes.agentAvatar}>
        <AgentAvatar
          size="small"
          purpose="decoration"
          name={agent.name}
          src={
            buildAvatarUrl(agent.installation, agent.technicalName, {
              size: OPTION_AVATAR_SIZE,
            }) ?? ''
          }
        />
      </span>
    ),
    [buildAvatarUrl, classes.agentAvatar],
  );

  // With `groupByNamespace`, grouped by namespace behind the Recent group, or
  // flat when that would be a single heading or while a search is typed, so
  // the matches read as one list. Otherwise grouped by
  // installation only when there is more than one, since a single
  // group heading repeating the only installation's name is pure noise. Order is
  // already home-then-installation-then-name from `sortAgentRows`, so grouping
  // keeps it. With more than one installation the label itself names the
  // installation too (`agentOptionLabel`): the group heading is only visible
  // in the open list, and the selected value must still tell an "SRE Agent"
  // on one installation from its namesake on another.
  const isSearchable = searchable ?? listed.length > SEARCHABLE_THRESHOLD;
  const isSearching = searchText.trim() !== '';
  const options = useMemo(() => {
    const installations = [...new Set(listed.map(agent => agent.installation))];
    const multipleInstallations = installations.length > 1;
    const toOption = (agent: AgentRow, idPrefix = '') => ({
      id: `${idPrefix}${agent.id}`,
      label: agentOptionLabel(agent, multipleInstallations),
      description: describeAgent(agent),
      leadingIcon: renderAvatar(agent),
      disabled: !isStartableAgent(agent),
    });

    if (groupByNamespace) {
      const recent = isSearching
        ? []
        : (recentAgentIds ?? [])
            .map(id => listed.find(agent => agent.id === id))
            .filter((agent): agent is AgentRow => agent !== undefined);
      const namespaces = [
        ...new Set(listed.map(agent => agent.namespace)),
      ].sort((a, b) => a.localeCompare(b));
      if (isSearching || (recent.length === 0 && namespaces.length <= 1)) {
        return listed.map(agent => toOption(agent));
      }
      const groups = namespaces.map(namespace => ({
        title: namespace,
        options: listed
          .filter(agent => agent.namespace === namespace)
          .map(agent => toOption(agent)),
      }));
      return recent.length > 0
        ? [
            {
              title: 'Recent',
              options: recent.map(agent =>
                toOption(agent, RECENT_OPTION_PREFIX),
              ),
            },
            ...groups,
          ]
        : groups;
    }

    if (!multipleInstallations) {
      return listed.map(agent => toOption(agent));
    }

    return installations.map(installation => ({
      title: installation,
      options: listed
        .filter(agent => agent.installation === installation)
        .map(agent => toOption(agent)),
    }));
  }, [listed, renderAvatar, groupByNamespace, recentAgentIds, isSearching]);

  const searchFilter = useMemo(
    () =>
      pickerSearchFilter(
        listed.map(agent =>
          agentOptionLabel(
            agent,
            new Set(listed.map(each => each.installation)).size > 1,
          ),
        ),
      ),
    [listed],
  );

  const pickerOptions = useMemo(
    () =>
      pickerFooterAction
        ? [
            ...options,
            { id: FOOTER_ACTION_ID, label: pickerFooterAction.label },
          ]
        : options,
    [options, pickerFooterAction],
  );

  useEffect(() => {
    onSelectedAgentChange?.(selectedAgent);
  }, [onSelectedAgentChange, selectedAgent]);

  const selectAgent = useCallback((agent: AgentRow) => {
    if (!isStartableAgent(agent)) {
      return;
    }
    touched.current = true;
    setSelectedId(agent.id);
  }, []);

  const text = prompt.trim();
  const isTooLong = text.length > MESSAGE_TEXT_MAX_LENGTH;
  const canSubmit = Boolean(text) && !isTooLong && !isStarting;

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    if (!selectedAgent) {
      setAgentMissing(true);
      agentSelectRef.current?.querySelector('button')?.focus();
      return;
    }
    onStart(selectedAgent, text);
    // Deliberately not cleared here. A create can fail, and this is the only
    // place the prompt still exists — the caller clears it by unmounting this
    // component (navigating away) once the session exists.
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  // On the field rather than the form: jsx-a11y forbids key handlers on a
  // <form>, and `TextAreaField` forwards this one to its textarea. Enter sends and
  // Shift+Enter breaks the line — see `isSendKey`.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (isSendKey(event)) {
      event.preventDefault();
      submit();
    }
  };

  let caption: string;
  if (isTooLong) {
    caption = `That prompt is ${text.length} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`;
  } else if (isLoadingAgents) {
    caption = 'Still checking the remaining installations for agents…';
  } else {
    caption =
      'Enter starts a session and sends this as the first message. Shift+Enter for a new line.';
  }

  // A preselected agent whose model is gone is exactly what to know before
  // typing a prompt at it.
  const modelWarning = modelWarningFor(selectedAgent);

  return (
    <form onSubmit={handleSubmit}>
      <Flex direction="column" gap="2">
        {error && (
          <Alert
            status="danger"
            title="Session not started"
            description={error}
          />
        )}
        {modelWarning && selectedAgent && (
          <Alert
            status="warning"
            title={`${selectedAgent.name}'s model is ${
              SERVED_MODEL_READINESS[modelWarning.readiness].phrase
            }${modelWarning.reason ? ` (${modelWarning.reason})` : ''}`}
            description={`${SERVING_BACKEND_LABEL[modelWarning.backend]} ${
              modelWarning.namespace ? `${modelWarning.namespace}/` : ''
            }${modelWarning.name}: ${
              modelWarning.message
            } You can still start the session; its first turn fails until the model serves again. The Serving view on the Models tab has the fix.`}
          />
        )}

        <ComposerFrame
          className={STABLE_CLASS_NAMES.composer}
          minRows={expanded ? EXPANDED_ROWS : COLLAPSED_ROWS}
          maxRows={MAX_ROWS}
          input={
            <TextAreaField
              aria-label="Prompt"
              placeholder={
                promptPlaceholder?.(selectedAgent) ??
                'What should the agent do?'
              }
              value={prompt}
              onChange={setPrompt}
              onFocus={() => setExpanded(true)}
              onKeyDown={handleKeyDown}
              // The rule guards against stealing focus on page load, which is why the
              // inline placement leaves this off. It is opt-in for the dialog, where
              // the user has just deliberately opened a box in order to type — and
              // react-aria focuses the dialog container rather than the field, so
              // without it the cursor is nowhere and the field has to be clicked
              // first. Focusing the first meaningful control is what the ARIA dialog
              // pattern asks for. Same exception, same reason, as
              // `SessionRenameDialog`.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={autoFocus}
            />
          }
          leading={
            <>
              <Select
                ref={agentSelectRef}
                aria-label="Agent"
                className={classes.agentSelect}
                isInvalid={showAgentMissing}
                // `leadingIcon` only reaches the options; the trigger has its own
                // slot, and without this the chosen agent loses the avatar it had
                // in the list.
                icon={selectedAgent ? renderAvatar(selectedAgent) : undefined}
                options={pickerOptions}
                selectedKey={selectedId ?? null}
                onSelectionChange={key => {
                  setSearchText('');
                  const id = key ? String(key) : undefined;
                  if (id === FOOTER_ACTION_ID) {
                    pickerFooterAction?.onAction();
                    return;
                  }
                  touched.current = true;
                  setSelectedId(
                    id?.startsWith(RECENT_OPTION_PREFIX)
                      ? id.slice(RECENT_OPTION_PREFIX.length)
                      : id,
                  );
                }}
                onOpenChange={isOpen => {
                  if (!isOpen) {
                    setSearchText('');
                  }
                }}
                placeholder={pickerPlaceholder}
                // Grouped by namespace, the search text is held here so the
                // Recent group can step aside while a search is typed.
                {...(groupByNamespace
                  ? isSearchable && {
                      search: {
                        inputValue: searchText,
                        onInputChange: setSearchText,
                        placeholder: `Search ${listed.length} agents`,
                        filter: searchFilter,
                      },
                    }
                  : { searchable: isSearchable })}
                // A sole startable agent is no choice, unless unavailable ones
                // are listed beside it with their reasons or the picker also
                // holds its footer action.
                isDisabled={
                  isStarting ||
                  (Boolean(soleAgent) &&
                    listed.length === 1 &&
                    !pickerFooterAction)
                }
              />
              {renderPickerAccessory?.(selectedAgent)}
            </>
          }
          trailing={
            <ButtonIcon
              type="submit"
              aria-label="Start"
              icon={<ArrowForwardIcon />}
              // Not disabled while starting: pending keeps the button focused,
              // so the wait is announced and a failure leaves focus in place.
              isDisabled={!canSubmit && !isStarting}
              isPending={isStarting}
            />
          }
        />

        {showAgentMissing && !isTooLong ? (
          <Text variant="body-small" color="danger" role="alert">
            Choose an agent to start.
          </Text>
        ) : (
          <Text variant="body-small" color="secondary">
            {caption}
          </Text>
        )}
        {renderFooter?.({ selectedAgent, selectAgent })}
      </Flex>
    </form>
  );
}
