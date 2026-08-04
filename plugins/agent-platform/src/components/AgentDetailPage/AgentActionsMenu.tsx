import { useState } from 'react';
import { ButtonIcon, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import { AgentManifestDialog } from './AgentManifestDialog';

/**
 * The agent details page's header actions.
 *
 * Owns the manifest dialog's open state itself, rather than the page doing so:
 * the page hands this element to `useProvidePageHeaderActions`, which renders it
 * in the shared plugin header — a different part of the tree — so keeping the
 * state here is what makes the menu and its dialog one self-contained unit.
 *
 * Read-only for now. kagent supports deleting and re-deploying an agent, but a
 * delete has to remove only the agent's own HelmRelease and never the
 * `OCIRepository` a namespace's agents share, so it needs more than a menu item.
 */
export function AgentActionsMenu({ agent }: { agent: Agent }) {
  const [isManifestOpen, setManifestOpen] = useState(false);

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
