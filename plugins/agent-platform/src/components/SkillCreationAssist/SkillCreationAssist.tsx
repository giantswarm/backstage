import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex } from '@backstage/ui';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import { readMetaAgents } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import { useCreateSession } from '../../hooks/useCreateSession';
import { useMetaAgent } from '../../hooks/useMetaAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { sessionDetailRouteRef } from '../../routes';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { MetaAgentBanner } from '../MetaAgentBanner';
import { isStartableAgent } from '../NewSessionComposer';
import {
  skillCreationPrompt,
  type SkillCreationTarget,
} from './skillCreationPrompt';

export type SkillCreationAssistProps = {
  /**
   * What the session is about, read when the person presses the button — so
   * a new skill carries the repository, name and description as typed then.
   */
  getTarget: () => SkillCreationTarget;
};

/**
 * The Add Skill and Edit Skill forms' caveat and hand-off to the skill
 * creator agent (`agentPlatform.metaAgents.skillCreation`): the forms write a
 * SKILL.md only, so complex, nested skills — reference files, scripts, data —
 * go through that agent instead (multi-file-skills plan, PO decision 1). The
 * same tinted strip as the create-agent flow's "Let Swarm Operator help"
 * (`MetaAgentBanner`); pressing it starts a session with the agent, its first
 * message naming the repository (or the skill being changed), and opens it
 * like every other session entry point.
 *
 * Hidden entirely — no teaser, no disabled button — while the role is
 * unconfigured, still resolving, names an agent that does not exist, or names
 * one that cannot take a session right now (decision G13). The config read is
 * the cheap outer gate; the fleet-wide agent list the resolution needs is only
 * mounted once a name is configured.
 */
export function SkillCreationAssist(props: SkillCreationAssistProps) {
  const { config } = useSignedInConfig();
  const configured = readMetaAgents(config).skillCreation;
  if (!configured) {
    return null;
  }
  return (
    <AgentsDataProvider>
      <SkillCreationAssistControl {...props} />
    </AgentsDataProvider>
  );
}

function SkillCreationAssistControl({ getTarget }: SkillCreationAssistProps) {
  const creator = useMetaAgent('skillCreation');
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const { createSession, isCreating, error } = useCreateSession(
    'skillCreationAssist',
  );

  const onStart = useCallback(async () => {
    if (!creator) {
      return;
    }
    const prompt = skillCreationPrompt(getTarget());
    let sessionId: string;
    try {
      sessionId = await createSession({ agent: creator, prompt });
    } catch {
      // Shown from the hook's error, below the strip.
      return;
    }
    const href = sessionDetailRoute?.({
      installation: creator.installation,
      sessionId,
    });
    if (!href) {
      return;
    }
    // The prompt travels with the navigation and is sent by the session
    // detail page — see "Starting a session" in docs/agent-platform.md.
    navigate(href, {
      state: {
        [NEW_SESSION_STATE_KEY]: {
          text: prompt,
          agentNamespace: creator.namespace,
          agentName: creator.technicalName,
        },
      },
    });
  }, [createSession, creator, getTarget, navigate, sessionDetailRoute]);

  if (!creator || !isStartableAgent(creator)) {
    return null;
  }
  return (
    <Flex direction="column" gap="2">
      <MetaAgentBanner
        agent={creator}
        label={`Write complex skills with ${creator.name}`}
        title="Use this form for simple skills."
        description={`Use the skill creator agent, ${creator.name}, for more complex, nested skills — with reference files, scripts or data. It writes the skill with you in a session and proposes it as a pull request.`}
        action={
          <Button
            variant="secondary"
            iconEnd={<ArrowForwardIcon fontSize="small" />}
            isDisabled={isCreating}
            onPress={onStart}
          >
            {isCreating ? 'Starting…' : `Let ${creator.name} help`}
          </Button>
        }
      />
      {error && (
        <Alert
          status="danger"
          title={`Could not start a session with ${creator.name}`}
          description={error.message}
        />
      )}
    </Flex>
  );
}
