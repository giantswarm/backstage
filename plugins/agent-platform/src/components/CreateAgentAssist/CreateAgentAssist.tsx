import { useState } from 'react';
import { Button, Flex, Text } from '@backstage/ui';
import { readMetaAgents } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import { useMetaAgent } from '../../hooks/useMetaAgent';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { AssistPanel } from './AssistPanel';

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
  const assistant = useMetaAgent('agentManagement');
  const [isOpen, setOpen] = useState(false);
  if (!assistant) {
    return null;
  }
  return (
    <>
      <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
        <Button variant="secondary" size="small" onPress={() => setOpen(true)}>
          Let {assistant.name} help
        </Button>
        <Text variant="body-small" color="secondary">
          Drafts the instructions with you in a side chat. Nothing changes in
          the form until you accept it.
        </Text>
      </Flex>
      {isOpen && (
        <AssistPanel assistant={assistant} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
