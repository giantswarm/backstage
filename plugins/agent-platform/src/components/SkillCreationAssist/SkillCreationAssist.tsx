import { Alert, Button, Flex } from '@backstage/ui';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import { readMetaAgents } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import { useMetaAgentHandoff } from '../../hooks/useMetaAgentHandoff';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { MetaAgentBanner } from '../MetaAgentBanner';
import {
  skillCreationPrompt,
  type SkillCreationTarget,
} from './skillCreationPrompt';

export type SkillCreationAssistProps = {
  /**
   * What the session is about, read when the person presses the button — so
   * a new skill carries the repository, name, description and instructions as
   * typed then.
   */
  getTarget: () => SkillCreationTarget;
  /** The Edit Skill form: the button reads "Edit with …". */
  isEdit?: boolean;
};

/**
 * The Add Skill and Edit Skill forms' caveat and hand-off to the skill
 * creator agent (`agentPlatform.metaAgents.skillCreation`): the forms write a
 * SKILL.md only, so complex, nested skills — reference files, scripts, data —
 * go through that agent instead (multi-file-skills plan, PO decision 1). The
 * same tinted strip as the create-agent flow's "Let Swarm Operator help"
 * (`MetaAgentBanner`), but a "<verb> with X" hand-off (see its naming
 * contract): pressing it starts a session with the agent and opens it, so the
 * strip says so. The form is left behind, so its input goes with the session
 * instead of being lost (UX review H1): the first message carries everything
 * typed — a new skill's name, description and instructions, or what was
 * changed of an existing one — fenced as a draft (`skillCreationPrompt`).
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

function SkillCreationAssistControl({
  getTarget,
  isEdit = false,
}: SkillCreationAssistProps) {
  const {
    agent: creator,
    start,
    isCreating,
    error,
  } = useMetaAgentHandoff('skillCreation', 'skillCreationAssist');

  if (!creator) {
    return null;
  }
  return (
    <Flex direction="column" gap="2">
      <MetaAgentBanner
        agent={creator}
        label={`Write complex skills with ${creator.name}`}
        title="Rather let an agent write it?"
        description={`This form is for simple skills; for complex, multi-file ones, start a session with ${creator.name}, which continues from what you typed.`}
        action={
          <Button
            variant="secondary"
            size="small"
            iconEnd={<ArrowForwardIcon fontSize="small" />}
            isDisabled={isCreating}
            onPress={() => {
              start(skillCreationPrompt(getTarget())).catch(() => {});
            }}
          >
            {isCreating
              ? 'Starting…'
              : `${isEdit ? 'Edit' : 'Create'} with ${creator.name}`}
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
