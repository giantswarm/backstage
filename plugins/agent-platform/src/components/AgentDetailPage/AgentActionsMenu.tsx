import { useState } from 'react';
import { ButtonIcon, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import EditOutlinedIcon from '@material-ui/icons/EditOutlined';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import UpdateIcon from '@material-ui/icons/Update';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentManagerPresence } from '../../hooks/useAgentManager';
import { AgentManifestDialog } from './AgentManifestDialog';

/**
 * Whether the installation's muster lists agent-manager — the one signal the
 * write actions gate on. `presence` is per installation (`core_mcpserver_list`
 * through the person's own muster session); `isUnavailable` means this portal
 * has no muster plugin, the only way to reach agent-manager.
 */
export type AgentManagerGate = {
  presence: AgentManagerPresence;
  isUnavailable: boolean;
};

/**
 * Why the write actions are not offered, in one sentence for the menu. Absent
 * while the server list is still being read: the items are withheld then,
 * rather than appearing and disappearing under the pointer.
 */
export function agentManagerAbsenceReason(
  gate: AgentManagerGate,
  installation: string,
): string | undefined {
  if (gate.isUnavailable) {
    return 'Editing, updating skills and deleting go through agent-manager over muster, and this portal has no muster plugin.';
  }
  if (gate.presence === 'missing') {
    return `Editing, updating skills and deleting go through agent-manager, and muster on ${installation} lists no agent-manager.`;
  }
  return undefined;
}

/**
 * The agent details page's header actions.
 *
 * Owns its manifest dialog's open state itself, rather than the page doing so:
 * the page hands this element to `useProvidePageHeaderActions`, which renders it
 * in the shared plugin header — a different part of the tree — so keeping the
 * state here is what makes the menu and that dialog one self-contained unit.
 *
 * The write actions are the page's. Rendering in the shared header means
 * rendering **outside the plugin's `QueryClientProvider`**, so anything backed
 * by react-query — the agent-manager reads and mutations behind Delete, Edit
 * and Update skills — is called by the page and their dialogs are rendered in
 * the page body; the menu only says whether they are offered (feature
 * detection from the MCPServer presence, passed in as `agentManager`) and asks
 * the page to open them. Authorization is the apiserver's, reached through
 * agent-manager as the person: a viewer sees the items and gets the Forbidden
 * on confirm.
 */
export function AgentActionsMenu({
  agent,
  agentManager,
  onEdit,
  onUpdateSkills,
  onDelete,
}: {
  agent: Agent;
  agentManager: AgentManagerGate;
  onEdit: () => void;
  onUpdateSkills: () => void;
  onDelete: () => void;
}) {
  const [isManifestOpen, setManifestOpen] = useState(false);
  const installation = agent.cluster;
  const offered =
    !agentManager.isUnavailable && agentManager.presence === 'available';
  const reason = agentManagerAbsenceReason(agentManager, installation);

  return (
    <>
      <MenuTrigger>
        <ButtonIcon
          icon={<MoreVertIcon />}
          aria-label="Agent actions"
          variant="tertiary"
        />
        <Menu>
          <MenuItem onAction={() => setManifestOpen(true)}>
            View manifest
          </MenuItem>
          {/* Three separate conditionals rather than one fragment: react-aria
              builds the menu's collection from its direct children. */}
          {offered ? (
            <MenuItem iconStart={<EditOutlinedIcon />} onAction={onEdit}>
              Edit agent…
            </MenuItem>
          ) : null}
          {offered ? (
            <MenuItem iconStart={<UpdateIcon />} onAction={onUpdateSkills}>
              Update skills…
            </MenuItem>
          ) : null}
          {offered ? (
            <MenuItem
              color="danger"
              iconStart={<DeleteOutlineIcon />}
              onAction={onDelete}
            >
              Delete agent…
            </MenuItem>
          ) : null}
          {/* Says why the actions are missing rather than leaving a menu with
              one item and no explanation; disabled, since there is nothing to
              do about it from here. */}
          {reason ? <MenuItem isDisabled>{reason}</MenuItem> : null}
        </Menu>
      </MenuTrigger>

      <AgentManifestDialog
        agent={agent}
        isOpen={isManifestOpen}
        onOpenChange={setManifestOpen}
      />
    </>
  );
}
