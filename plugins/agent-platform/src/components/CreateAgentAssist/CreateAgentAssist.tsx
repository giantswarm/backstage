import { useState } from 'react';
import { Button, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { readMetaAgents } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useMetaAgent } from '../../hooks/useMetaAgent';
import type { AvatarSize } from '../../lib/agentAvatar';
import { AgentAvatar } from '../AgentAvatar';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { AssistPanel } from './AssistPanel';

/** Twice the rendered 32px, for sharp 2x displays. */
const AVATAR_SIZE: AvatarSize = 96;

const useStyles = makeStyles({
  // The CreateAgent artboard's tinted Swarm Operator strip above the form:
  // the assistant's avatar, a title line and what it does, the button that
  // opens it — wrapping to stacked lines at phone width. Same tint and
  // spacing as Customize → Agents' helper banner, so the two read as one
  // idiom.
  banner: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-3) var(--bui-space-4)',
    padding: 'var(--bui-space-4)',
    borderRadius: 12,
    background: 'var(--agent-shell-rail-bg, #f0f7f9)',
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-3)',
    flex: '1 1 260px',
    minWidth: 0,
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
});

/**
 * The create flow's "with Swarm Operator" affordance (W6 stretch), gated on
 * the `metaAgents.agentManagement` role mapping (decision G13): hidden
 * entirely — no teaser, no disabled button — while the role is unconfigured,
 * still resolving, or names an agent that does not exist.
 *
 * The config read is the cheap outer gate; the fleet-wide agent list that the
 * resolution needs (`AgentsDataProvider`) is only mounted once a name is
 * configured, so installations without the role pay nothing for this.
 */
export function CreateAgentAssist() {
  const { config } = useSignedInConfig();
  const configured = readMetaAgents(config).agentManagement;
  if (!configured) {
    return null;
  }
  return (
    <AgentsDataProvider>
      <CreateAgentAssistControl />
    </AgentsDataProvider>
  );
}

function CreateAgentAssistControl() {
  const classes = useStyles();
  const assistant = useMetaAgent('agentManagement');
  const buildAvatarUrl = useAgentAvatarUrl();
  const [isOpen, setOpen] = useState(false);
  if (!assistant) {
    return null;
  }
  return (
    <>
      <section
        className={classes.banner}
        aria-label={`Set up the agent with ${assistant.name}`}
      >
        <div className={classes.identity}>
          <AgentAvatar
            size="medium"
            purpose="decoration"
            name={assistant.name}
            src={
              buildAvatarUrl(assistant.installation, assistant.technicalName, {
                size: AVATAR_SIZE,
              }) ?? ''
            }
          />
          <div className={classes.copy}>
            <Text as="p" variant="body-medium" weight="bold">
              Rather describe it in your own words?
            </Text>
            <Text as="p" variant="body-small" color="secondary">
              {assistant.name} drafts the instructions and suggests skills with
              you in a side chat. Nothing changes in the form until you accept
              it.
            </Text>
          </div>
        </div>
        <Button
          variant="secondary"
          onPress={() => setOpen(true)}
          aria-expanded={isOpen}
        >
          Let {assistant.name} help
        </Button>
      </section>
      {isOpen && (
        <AssistPanel assistant={assistant} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
