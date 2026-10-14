import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Button, ButtonIcon, Flex, Text } from '@backstage/ui';
import { makeStyles, Portal } from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import CloseIcon from '@material-ui/icons/Close';
import {
  usePhoneLayout,
  useWizardFrameAside,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useCreateSession } from '../../hooks/useCreateSession';
import { AgentAvatar } from '../AgentAvatar';
import type { AgentRow } from '../AgentsDataProvider';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { NewSessionComposer } from '../NewSessionComposer';
import { AssistConversation } from './AssistConversation';
import { assistOpeningPrompt } from './assistPrompt';

/** The docked panel's width; the wizard reserves as much beside it. */
export const ASSIST_PANEL_WIDTH = 420;

const useStyles = makeStyles(theme => ({
  // A side panel over the page's right edge, so the form stays in reach beside
  // the chat — accepting a suggestion into it is the panel's whole point. The
  // wizard keeps its step and footer clear of it (useWizardFrameAside).
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: ASSIST_PANEL_WIDTH,
    maxWidth: '100vw',
    zIndex: theme.zIndex.drawer,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: `var(--bui-bg-surface-1, ${theme.palette.background.paper})`,
    borderLeft: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.shadows[8],
    '&:focus': { outline: 'none' },
  },
  // Where the form cannot keep room beside the panel — a phone, or a frame
  // narrower than the panel and a usable form — it is the screen, as a modal:
  // a drawer over a 375px form helps nobody. Over the shell's bottom bar too.
  covering: {
    left: 0,
    width: 'auto',
    maxWidth: 'none',
    maxHeight: '100dvh',
    borderLeft: 'none',
    boxShadow: 'none',
    // A long draft must not take the screen: four lines, then it scrolls
    // (C13). The composers grow to 12 rows by themselves; this caps them here
    // only. `!important` beats the autosize's inline overflow.
    '& textarea': {
      maxHeight: '7.5em',
      overflowY: 'auto !important',
    },
  },
  hidden: {
    display: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  // One line on a phone: every pixel of the header is taken from the chat.
  headerCompact: {
    alignItems: 'center',
    padding: theme.spacing(1, 1.5),
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  start: {
    padding: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    paddingBottom: `calc(${theme.spacing(2)}px + env(safe-area-inset-bottom, 0px))`,
  },
}));

/**
 * Makes everything but `panel` unreachable while a modal panel is open: the
 * other children of `<body>` (the app, and whatever else sits there) get
 * `inert`, and the page stops scrolling behind it. Undone when the panel
 * closes or unmounts; elements that were inert already are left so.
 */
function useModalBackground(panel: HTMLElement | null, active: boolean) {
  useEffect(() => {
    if (!active || !panel) {
      return undefined;
    }
    const others = Array.from(document.body.children).filter(
      element => element !== panel && !element.hasAttribute('inert'),
    );
    others.forEach(element => element.setAttribute('inert', ''));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      others.forEach(element => element.removeAttribute('inert'));
      document.body.style.overflow = overflow;
    };
  }, [panel, active]);
}

export type AssistPanelProps = {
  /** The agent configured as `metaAgents.agentManagement` (decision D6). */
  assistant: AgentRow;
  /**
   * Whether the panel shows. A closed panel stays mounted, hidden: closing it
   * to look at the form — a phone has no room for both — keeps the draft
   * prompt or the conversation, which carry on when it is opened again.
   */
  isOpen: boolean;
  onClose: () => void;
};

/**
 * The create-agent assist: a side chat with the configured agent-management
 * agent (the "Swarm Operator" of decision D6), next to the create form.
 *
 * Starting works like the Evaluate flow: a `NewSessionComposer` with the
 * assistant preselected and a create-agent-context prompt prefilled and
 * editable; the session is created on Start (`entryPoint: 'createAgentAssist'`)
 * and the conversation then runs **in the panel** rather than navigating away —
 * the person is mid-wizard, and the form must stay on screen for suggestions
 * to be accepted into it.
 *
 * Beside the wizard where it has room (a `complementary` region, the form's
 * step and footer kept clear of it); elsewhere — a phone, a narrow window — a
 * full-screen modal dialog with the background inert, closed by Escape or
 * "Back to form". Either way closing only hides it.
 */
export function AssistPanel({ assistant, isOpen, onClose }: AssistPanelProps) {
  const classes = useStyles();
  const { state } = useNewAgentForm();
  const creation = useCreateSession('createAgentAssist');
  const [started, setStarted] = useState<{
    sessionId: string;
    firstMessage: string;
  } | null>(null);

  const isPhone = usePhoneLayout();
  const { docked } = useWizardFrameAside(
    ASSIST_PANEL_WIDTH,
    isOpen && !isPhone,
  );
  const isModal = isPhone || !docked;

  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useModalBackground(panel, isOpen && isModal);

  // The first opening focuses the composer (its autoFocus); a reopening
  // focuses the panel itself, without pulling up a phone's keyboard over the
  // conversation the person came back to read.
  const openedBefore = useRef(false);
  useEffect(() => {
    if (!isOpen || !panel) {
      return;
    }
    if (openedBefore.current && !panel.contains(document.activeElement)) {
      panel.focus();
    }
    openedBefore.current = true;
  }, [isOpen, panel]);

  // In the capture phase: react-aria fields stop the key events they handle
  // from bubbling, the composer's among them. A key from a popover the panel
  // opened (portalled out of it) is the popover's own to handle.
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      isModal &&
      event.key === 'Escape' &&
      panel?.contains(event.target as Node)
    ) {
      event.stopPropagation();
      onClose();
    }
  };

  const { createSession } = creation;
  const handleStart = useCallback(
    (agent: AgentRow, prompt: string) => {
      createSession({ agent, prompt })
        .then(sessionId => setStarted({ sessionId, firstMessage: prompt }))
        // Left to the composer, which renders the hook's `error` and keeps
        // the prompt.
        .catch(() => {});
    },
    [createSession],
  );

  const buildAvatarUrl = useAgentAvatarUrl();
  const avatarUrl = buildAvatarUrl(
    assistant.installation,
    assistant.technicalName,
    { size: 48 },
  );

  const className = [
    classes.panel,
    isModal ? classes.covering : '',
    isOpen ? '' : classes.hidden,
  ].join(' ');

  // In <body>, outside the wizard: a fixed panel is not caught by a
  // transformed ancestor, and the modal can make its siblings inert.
  return (
    <Portal>
      {/* The same element in both presentations, so switching between them (a
          window resized, a tablet rotated) keeps the conversation mounted. */}
      <div
        ref={setPanel}
        className={className}
        role={isModal ? 'dialog' : 'complementary'}
        aria-modal={isModal ? true : undefined}
        aria-label={`${assistant.name} assist`}
        hidden={!isOpen}
        tabIndex={-1}
        onKeyDownCapture={handleKeyDownCapture}
      >
        <div
          className={`${classes.header} ${isModal ? classes.headerCompact : ''}`}
        >
          <AgentAvatar
            size="small"
            purpose="decoration"
            name={assistant.name}
            src={avatarUrl ?? ''}
          />
          <div className={classes.headerText}>
            <Text as="div" variant="body-medium" weight="bold" truncate>
              {assistant.name}
            </Text>
            {!isModal && (
              <Text as="div" variant="body-small" color="secondary">
                Helps you set up this agent. Nothing changes in the form until
                you accept it.
              </Text>
            )}
          </div>
          {isModal ? (
            <Button
              variant="secondary"
              size="small"
              iconStart={<ArrowBackIcon />}
              onPress={onClose}
            >
              Back to form
            </Button>
          ) : (
            <ButtonIcon
              variant="tertiary"
              icon={<CloseIcon />}
              aria-label="Close assistant"
              onPress={onClose}
            />
          )}
        </div>
        {started ? (
          <AssistConversation
            installation={assistant.installation}
            sessionId={started.sessionId}
            agent={{
              namespace: assistant.namespace,
              name: assistant.technicalName,
            }}
            agentName={assistant.name}
            agentAvatarUrl={avatarUrl}
            firstMessage={started.firstMessage}
          />
        ) : (
          <div className={classes.start}>
            <Flex direction="column" gap="2">
              <Text variant="body-medium">
                Tell {assistant.name} what the agent is for. It drafts the
                instructions and suggests skills; you accept what fits into the
                form.
              </Text>
              <NewSessionComposer
                agents={[assistant]}
                defaultAgent={assistant}
                initialPrompt={assistOpeningPrompt(state)}
                isStarting={creation.isCreating}
                error={creation.error?.message}
                onStart={handleStart}
                // The person just opened the panel in order to type; see the
                // dialogs that make the same exception.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </Flex>
          </div>
        )}
      </div>
    </Portal>
  );
}
