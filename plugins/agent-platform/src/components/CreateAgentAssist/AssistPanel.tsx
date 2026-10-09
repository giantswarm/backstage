import { useCallback, useState } from 'react';
import { ButtonIcon, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useCreateSession } from '../../hooks/useCreateSession';
import { AgentAvatar } from '../AgentAvatar';
import type { AgentRow } from '../AgentsDataProvider';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { NewSessionComposer } from '../NewSessionComposer';
import { AssistConversation } from './AssistConversation';
import { assistOpeningPrompt } from './assistPrompt';

const useStyles = makeStyles(theme => ({
  // A side panel over the page's right edge, so the form stays in reach beside
  // the chat — accepting a suggestion into it is the panel's whole point. At
  // phone width it is the screen: a drawer next to a 375px form helps nobody.
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 420,
    maxWidth: '100vw',
    zIndex: theme.zIndex.drawer,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: `var(--bui-bg-surface-1, ${theme.palette.background.paper})`,
    borderLeft: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.shadows[8],
    [theme.breakpoints.down('xs')]: {
      left: 0,
      width: 'auto',
    },
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
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
  },
}));

export type AssistPanelProps = {
  /** The agent configured as `metaAgents.agentManagement` (decision D6). */
  assistant: AgentRow;
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
 */
export function AssistPanel({ assistant, onClose }: AssistPanelProps) {
  const classes = useStyles();
  const { state } = useNewAgentForm();
  const creation = useCreateSession('createAgentAssist');
  const [started, setStarted] = useState<{
    sessionId: string;
    firstMessage: string;
  } | null>(null);

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

  return (
    <aside className={classes.panel} aria-label={`${assistant.name} assist`}>
      <div className={classes.header}>
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
          <Text as="div" variant="body-small" color="secondary">
            Helps you set up this agent. Nothing changes in the form until you
            accept it.
          </Text>
        </div>
        <ButtonIcon
          variant="tertiary"
          icon={<CloseIcon />}
          aria-label="Close assistant"
          onPress={onClose}
        />
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
    </aside>
  );
}
