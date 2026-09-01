import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Avatar,
  Button,
  Flex,
  Select,
  Text,
  TextAreaField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import type { AgentRow } from '../AgentsDataProvider';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';

/** Rows the textarea shows before and after it expands. */
const COLLAPSED_ROWS = 1;
const EXPANDED_ROWS = 4;

/** Above this many agents the picker gets a search box. */
const SEARCHABLE_THRESHOLD = 8;

/** Matches the sessions table's row avatar: one line of text, 2× for hi-dpi. */
const OPTION_AVATAR_SIZE: AvatarSize = 48;

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

export type NewSessionComposerProps = {
  /**
   * Agents to offer, in display order. Non-ready ones are filtered out here rather
   * than shown disabled: a picker is for choosing, and an entry that cannot be
   * chosen is noise in it. Readiness and its reason live on the Agents tab and on
   * each agent's own page, which is where someone goes to find out why an agent is
   * unavailable.
   */
  agents: AgentRow[];
  /** Some installations are still being queried, so more agents may appear. */
  isLoadingAgents?: boolean;
  /**
   * Preselected agent. The sessions list passes the last one used; the agent
   * detail page passes the agent whose page it is.
   */
  defaultAgent?: AgentRow;
  /**
   * Start as a single line and expand on focus. The inline placement uses this so
   * the list below stays the main event; the dialog does not, since it is already
   * a deliberate act.
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
 * A bound is needed, not cosmetic. `readinessMessage` for a `notAccepted` agent is
 * the controller's raw reconcile error, and a real one on gazelle is a 400-character
 * multi-line Postgres dial failure repeated twice — which turns one option into a
 * wall of text and pushes every other agent off the screen. The full message is on
 * the Agents tab and the agent's own page, where there is room for it.
 */
const DESCRIPTION_MAX_LENGTH = 100;

/** What to say about an agent under its name in the picker. */
function describeAgent(agent: AgentRow): string | undefined {
  if (!agent.description) {
    return undefined;
  }

  // One line, bounded: a description is free text and a couple on gazelle run to
  // several sentences, which would push the other options off the screen.
  const collapsed = agent.description.replace(/\s+/g, ' ').trim();
  return collapsed.length > DESCRIPTION_MAX_LENGTH
    ? `${collapsed.slice(0, DESCRIPTION_MAX_LENGTH).trimEnd()}…`
    : collapsed;
}

/**
 * Start a new session: a prompt, an agent, and Start.
 *
 * The prompt is the only required input in the spec's sense — but an agent has to
 * be chosen too, because unlike the prototype we have no canonical
 * "general purpose" agent to fall back on, and a wrong guess here starts a paid
 * turn against an agent that can act on a cluster. So Start stays disabled until
 * both are in hand.
 *
 * Expansion is deliberately **one-way**: once focused, the toolbar stays. A
 * composer that collapsed on blur would hide the agent the user just picked, and
 * re-collapsing under the cursor reads as a glitch.
 *
 * Not built on {@link SessionComposer}, which sends into an existing session.
 * Both axes that component takes (`isAgentWorking`, `isFinished`) and all three
 * of its captions are meaningless before a session exists, and what the two
 * genuinely share — trim, the length bound, Cmd/Ctrl+Enter — is a handful of
 * lines. An abstraction over two callers would cost more than it saves; the
 * length bound itself is imported rather than restated.
 */
export function NewSessionComposer({
  agents,
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
  const [prompt, setPrompt] = useState('');
  const [expanded, setExpanded] = useState(!collapsible);
  // Filtered once; every decision below reads the filtered list — what is offered,
  // what counts as a sole option, and whether a default is still valid.
  const offered = useMemo(() => agents.filter(isStartableAgent), [agents]);

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

  // The same deterministic avatar the sessions table and the agent's own page
  // show, so one agent looks the same everywhere. Seeded from the technical name,
  // not the display name.
  const renderAvatar = useCallback(
    (agent: AgentRow) => (
      <span className={classes.agentAvatar}>
        <Avatar
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

  // Grouped by installation only when there is more than one, since a single
  // group heading repeating the only installation's name is pure noise. Order is
  // already installation-then-name from `sortAgentRows`, so grouping keeps it.
  const options = useMemo(() => {
    const toOption = (agent: AgentRow) => ({
      id: agent.id,
      label: agent.name,
      description: describeAgent(agent),
      leadingIcon: renderAvatar(agent),
    });

    const installations = [
      ...new Set(offered.map(agent => agent.installation)),
    ];
    if (installations.length <= 1) {
      return offered.map(toOption);
    }

    return installations.map(installation => ({
      title: installation,
      options: offered
        .filter(agent => agent.installation === installation)
        .map(toOption),
    }));
  }, [offered, renderAvatar]);

  const text = prompt.trim();
  const isTooLong = text.length > MESSAGE_TEXT_MAX_LENGTH;
  const canStart =
    Boolean(text) && !isTooLong && Boolean(selectedAgent) && !isStarting;

  const submit = () => {
    if (!canStart || !selectedAgent) {
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
  // <form>, and `TextAreaField` forwards this one to its textarea.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
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
    caption = 'Starts a session and sends this as the first message.';
  }

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

        <TextAreaField
          aria-label="Prompt"
          placeholder="What should the agent do?"
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
          rows={expanded ? EXPANDED_ROWS : COLLAPSED_ROWS}
        />

        {expanded && (
          <Flex direction="column" gap="2">
            <Flex align="center" justify="between" gap="2">
              <Select
                aria-label="Agent"
                className={classes.agentSelect}
                // `leadingIcon` only reaches the options; the trigger has its own
                // slot, and without this the chosen agent loses the avatar it had
                // in the list.
                icon={selectedAgent ? renderAvatar(selectedAgent) : undefined}
                options={options}
                selectedKey={selectedId ?? null}
                onSelectionChange={key => {
                  touched.current = true;
                  setSelectedId(key ? String(key) : undefined);
                }}
                placeholder="Select an agent"
                searchable={offered.length > SEARCHABLE_THRESHOLD}
                isDisabled={isStarting || Boolean(soleAgent)}
              />
              <Button type="submit" isDisabled={!canStart}>
                {isStarting ? 'Starting…' : 'Start'}
              </Button>
            </Flex>
            <Text variant="body-small" color="secondary">
              {caption}
            </Text>
          </Flex>
        )}
      </Flex>
    </form>
  );
}
