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
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';

import type { UseDeleteModelConfigResult } from '../../hooks/useDeleteModelConfig';
import { modelConfigsRouteRef } from '../../routes';
import { ModelDeleteDialog } from './ModelDeleteDialog';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/**
 * The model detail page's kebab menu. Owns its dialog's open state itself
 * (the page hands this element to `useProvidePageHeaderActions`, which renders
 * it in the shared plugin header, a different part of the tree), while the
 * deletion arrives as a prop — the shared header renders **outside the
 * plugin's `QueryClientProvider`**, so anything backed by react-query has to
 * be called by the page and passed down. See AgentActionsMenu.
 */
export function ModelActionsMenu({
  modelConfig,
  deletion,
}: {
  modelConfig: ModelConfig;
  deletion: UseDeleteModelConfigResult;
}) {
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const modelsRoute = useRouteRef(modelConfigsRouteRef);

  const {
    isDeletable,
    isCheckingDeletable,
    deleteModelConfig,
    isDeleting,
    error,
    reset,
  } = deletion;

  // Withheld while the checks are still running, not only when they come back
  // negative, so the item never appears and then disappears under the pointer
  // of someone who was never allowed to use it.
  if (!isDeletable || isCheckingDeletable) {
    return null;
  }

  const openDeleteDialog = () => {
    // Clear a previous attempt's error, so the dialog does not open still
    // showing it.
    reset();
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteModelConfig();
    } catch {
      // Left to the dialog, which stays open and renders the hook's `error` —
      // including the refusal when agents still reference the model.
      return;
    }

    setDeleteOpen(false);
    toastApi.post({
      title: `Model "${modelConfig.getDisplayName()}" deleted`,
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });

    // An unbound route means the Agent Platform extension is disabled — in
    // which case this page is not rendering either.
    if (modelsRoute) {
      navigate(modelsRoute());
    }
  };

  return (
    <>
      <MenuTrigger>
        <ButtonIcon
          icon={<MoreVertIcon />}
          aria-label="Model actions"
          variant="tertiary"
        />
        <Menu>
          <MenuItem
            color="danger"
            iconStart={<DeleteOutlineIcon />}
            onAction={openDeleteDialog}
          >
            Delete model…
          </MenuItem>
        </Menu>
      </MenuTrigger>

      <ModelDeleteDialog
        modelConfig={modelConfig}
        isOpen={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        isDeleting={isDeleting}
        error={error?.message}
        onConfirm={confirmDelete}
      />
    </>
  );
}
