import { useEffect, useRef, useState } from 'react';
import { Button } from '@backstage/ui';
import { readMetaAgents } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import { useMetaAgent } from '../../hooks/useMetaAgent';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { MetaAgentBanner } from '../MetaAgentBanner';
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
  // Mounted from the first opening on, and only hidden when closed: on a
  // phone the panel is the screen, so looking at the form means closing it —
  // which must not throw away the draft or the conversation (B7).
  const [isMounted, setMounted] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);

  // Focus goes back to the button that opened the panel. In an effect, after
  // the panel's own effects have lifted the modal's `inert` off the page.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      openerRef.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  // An assistant no session can start with from this portal (its
  // installation's agent-manager is out of reach as the person) offers
  // nothing to open.
  if (!assistant || assistant.sessionBlocker) {
    return null;
  }
  return (
    <>
      <MetaAgentBanner
        agent={assistant}
        label={`Set up the agent with ${assistant.name}`}
        title="Rather describe it in your own words?"
        description={`${assistant.name} drafts the instructions and suggests skills with you in a side chat. Nothing changes in the form until you accept it.`}
        action={
          <Button
            ref={openerRef}
            variant="secondary"
            size="small"
            onPress={() => {
              setMounted(true);
              setOpen(true);
            }}
            aria-expanded={isOpen}
          >
            Let {assistant.name} help
          </Button>
        }
      />
      {isMounted && (
        <AssistPanel
          assistant={assistant}
          isOpen={isOpen}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
