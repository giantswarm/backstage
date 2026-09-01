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
import { READINESS_PRESENTATION } from '../AgentsTable/readinessStatus';
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

export type NewSessionComposerProps = {
  /**
   * Every agent the fleet offers, in display order. Non-ready ones are expected
   * to be included: they are shown disabled, with the reason, rather than left
   * out — an agent missing from the list is indistinguishable from one that never
   * existed.
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
  const detail =
    agent.readiness === 'ready'
      ? agent.description
      : [READINESS_PRESENTATION[agent.readiness].label, agent.readinessMessage]
          .filter(Boolean)
          .join(' — ');

  if (!detail) {
    return undefined;
  }

  // One line: a reconcile error is several, and an option is a single row.
  const collapsed = detail.replace(/\s+/g, ' ').trim();
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
  const [selectedId, setSelectedId] = useState<string | undefined>(
    defaultAgent?.id,
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
  const adopted = useRef(defaultAgent?.id);
  if (!touched.current && defaultAgent && adopted.current !== defaultAgent.id) {
    adopted.current = defaultAgent.id;
    setSelectedId(defaultAgent.id);
  }

  const selectedAgent = useMemo(
    () => agents.find(agent => agent.id === selectedId),
    [agents, selectedId],
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
      // Withheld rather than offered-then-failed: kagent would accept a session
      // for an agent whose pods are down, and the turn would then fail at the
      // first message with nothing explaining why.
      disabled: agent.readiness !== 'ready',
    });

    const installations = [...new Set(agents.map(agent => agent.installation))];
    if (installations.length <= 1) {
      return agents.map(toOption);
    }

    return installations.map(installation => ({
      title: installation,
      options: agents
        .filter(agent => agent.installation === installation)
        .map(toOption),
    }));
  }, [agents, renderAvatar]);

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
                searchable={agents.length > SEARCHABLE_THRESHOLD}
                isDisabled={isStarting}
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
