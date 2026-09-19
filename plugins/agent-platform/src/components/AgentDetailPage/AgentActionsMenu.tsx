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
 * What the write actions gate on. `presence` is whether the installation's
 * muster lists agent-manager, per installation (`core_mcpserver_list` through
 * the person's own muster session); `isUnavailable` means this portal has no
 * muster plugin, the only way to reach agent-manager.
 *
 * `isGitOpsOwned` is agent-manager's own verdict on this agent (`get_agent`'s
 * `managed: 'gitops'`): its HelmRelease is applied by a Flux Kustomization, so
 * every live write is refused. False when the read came back and said
 * otherwise, *and* when it settled without an answer — refused, or the muster
 * session is not connected — in which case the actions stay offered and
 * agent-manager refuses in its own words, as it did before this gate existed.
 *
 * `isVerdictPending` is that read still being in flight, which is not the same
 * thing: offering the actions then would show them to everyone for a muster
 * round-trip and take them away from exactly the people this gate exists for,
 * with a click in between opening the dialog it exists to prevent.
 */
export type AgentManagerGate = {
  presence: AgentManagerPresence;
  isUnavailable: boolean;
  isGitOpsOwned: boolean;
  isVerdictPending: boolean;
};

/**
 * Why the write actions are not offered, in one sentence — for a page to show,
 * not the menu. A menu is a list of things to do; an explanation sitting in it
 * as an unclickable item is neither. The menu therefore just omits what it
 * cannot offer, and `EditAgentPage` uses this for the empty state it answers a
 * deep link with.
 *
 * Absent while the server list or agent-manager's verdict on the agent is still
 * being read: nothing is offered then either, but there is nothing to say yet.
 */
export function agentManagerAbsenceReason(
  gate: AgentManagerGate,
  installation: string,
): string | undefined {
  if (gate.isVerdictPending) {
    return undefined;
  }
  if (gate.isGitOpsOwned) {
    return 'This agent is applied from git, so agent-manager refuses live writes. Edit it, update its skills or remove it in the GitOps repository instead.';
  }
  if (gate.isUnavailable) {
    return 'Editing, updating skills and deleting go through agent-manager over muster, and this portal has no muster plugin.';
  }
  if (gate.presence === 'missing') {
    return `Editing, updating skills and deleting go through agent-manager, and muster on ${installation} lists no agent-manager.`;
  }
  return undefined;
}

/**
 * A definite width for the menu, which is not cosmetic — the same fix, and the
 * same reason, as `SessionActionsMenu`'s `MENU_WIDTH`.
 *
 * Without it bui writes the literal string `"undefined"` as the menu's `width`,
 * the browser discards it, and the popover lays out at its natural width before
 * settling back to `.bui-MenuContent`'s `min-width: 150px`. That second pass
 * makes the browser report "ResizeObserver loop completed with undelivered
 * notifications" from react-aria's popover observer, which trips the dev-server
 * error overlay.
 *
 * Note bui applies `maxWidth` as CSS `width` despite the name, so this is the
 * definite width — keep it comfortably above the longest item ("Update
 * skills…" plus its icon) rather than trimmed to fit.
 */
const MENU_WIDTH = '12rem';

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
 * the page body; the menu only says whether they are offered (`agentManager`:
 * agent-manager's presence, and its verdict that the agent is writable at all)
 * and asks the page to open them. What it cannot offer it simply leaves out —
 * an explanation belongs on the page (the Overview tab's GitOps card already
 * carries the one for an agent applied from git), not as an unclickable item in
 * a list of things to do. Authorization stays the apiserver's, reached through
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
  const offered =
    !agentManager.isUnavailable &&
    agentManager.presence === 'available' &&
    !agentManager.isVerdictPending &&
    !agentManager.isGitOpsOwned;

  return (
    <>
      <MenuTrigger>
        <ButtonIcon
          icon={<MoreVertIcon />}
          aria-label="Agent actions"
          variant="tertiary"
        />
        <Menu maxWidth={MENU_WIDTH}>
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
