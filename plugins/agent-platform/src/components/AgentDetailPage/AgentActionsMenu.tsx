import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { ButtonIcon, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import type { UseDeleteAgentResult } from '../../hooks/useDeleteAgent';
import { agentsRouteRef } from '../../routes';
import { AgentDeleteDialog } from './AgentDeleteDialog';
import { AgentManifestDialog } from './AgentManifestDialog';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/**
 * The agent details page's header actions.
 *
 * Owns its dialogs' open state itself, rather than the page doing so: the page
 * hands this element to `useProvidePageHeaderActions`, which renders it in the
 * shared plugin header — a different part of the tree — so keeping the state here
 * is what makes the menu and its dialogs one self-contained unit.
 *
 * The deletion arrives as a prop for the same reason, and this is the constraint
 * to respect when adding an action: rendering in the shared header means rendering
 * **outside the plugin's `QueryClientProvider`**, so anything backed by react-query
 * — every `useResource`, access review or mutation — has to be called by the page
 * and passed down. Calling `useDeleteAgent` here throws "No QueryClient set".
 */
export function AgentActionsMenu({
  agent,
  deletion,
}: {
  agent: Agent;
  deletion: UseDeleteAgentResult;
}) {
  const [isManifestOpen, setManifestOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const agentsRoute = useRouteRef(agentsRouteRef);

  const {
    isDeletable,
    isCheckingDeletable,
    deleteAgent,
    isDeleting,
    error,
    reset,
  } = deletion;

  // Withheld while the checks are still running, not only when they come back
  // negative, so the item never appears and then disappears under the pointer of
  // someone who was never allowed to use it.
  const canOfferDelete = isDeletable && !isCheckingDeletable;

  const openDeleteDialog = () => {
    // Clear a previous attempt's error, so the dialog does not open still
    // showing it.
    reset();
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteAgent();
    } catch {
      // Left to the dialog, which stays open and renders the hook's `error`. No
      // toast: the user is still looking at the modal they pressed Delete in.
      return;
    }

    setDeleteOpen(false);
    toastApi.post({
      // Deliberately not "Agent deleted": the HelmRelease has a finalizer, so all
      // that is certain here is that the apiserver accepted the request and
      // helm-controller has started uninstalling. The agent can still be in the
      // list for a few seconds, and a toast claiming otherwise would read as a
      // bug in the list.
      title: `Deleting agent "${agent.getDisplayName()}"`,
      description:
        'Flux is uninstalling its Helm release, so it may take a moment to disappear from the list.',
      status: 'success',
      // A ToastApi toast without a timeout is permanent, and this is an
      // acknowledgement, not something to dismiss by hand.
      timeout: TOAST_TIMEOUT_MS,
    });

    // An unbound route means the Agent Platform extension is disabled — in which
    // case this page is not rendering either. Staying put beats hardcoding a
    // path that would silently rot if the route moved.
    if (agentsRoute) {
      navigate(agentsRoute());
    }
  };

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
          {canOfferDelete ? (
            <MenuItem
              color="danger"
              iconStart={<DeleteOutlineIcon />}
              onAction={openDeleteDialog}
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

      <AgentDeleteDialog
        agent={agent}
        isOpen={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        isDeleting={isDeleting}
        error={error?.message}
        onConfirm={confirmDelete}
      />
    </>
  );
}
