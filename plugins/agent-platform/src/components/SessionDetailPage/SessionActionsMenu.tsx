import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { ButtonIcon, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import EditOutlinedIcon from '@material-ui/icons/EditOutlined';
import MoreVertIcon from '@material-ui/icons/MoreVert';

import type { UseDeleteSessionResult } from '../../hooks/useDeleteSession';
import { sessionsRouteRef } from '../../routes';
import { SessionDeleteDialog } from './SessionDeleteDialog';

/** Long enough to read one line, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/**
 * An explicit width for the menu, which is not cosmetic.
 *
 * bui gives `.bui-MenuContent` `min-width: 150px` and otherwise leaves the width
 * to the content — its own `width` fallback is the string `"undefined"`, which the
 * browser discards. A `MenuItem` is a flex row with `gap: var(--bui-space-6)`
 * (24px) between label and trailing slot, so "Delete session…" plus its icon wants
 * ~155px: just over the minimum. The popover then renders at the natural width,
 * settles back to the 150px minimum, and that second layout pass makes the browser
 * report "ResizeObserver loop completed with undelivered notifications" from
 * react-aria's popover observer — twice, on every open. Harmless (Sentry filters
 * that message by default) but it trips the dev-server error overlay, which is very
 * much not harmless to work with.
 *
 * Sizing it up front means one layout pass and no warning. Note bui applies this
 * prop as CSS `width`, despite the name, so it is the definite width — keep it
 * comfortably above the longest item rather than trimmed to fit.
 */
const MENU_WIDTH = '12rem';

/**
 * The session details page's header actions.
 *
 * Owns the dialog's open state itself, rather than the page doing so: the page
 * hands this element to `useProvidePageHeaderActions`, which renders it in the
 * shared plugin header — a different part of the tree — so keeping the state here
 * is what makes the menu and its dialog one self-contained unit.
 *
 * The deletion and `isUserScoped` arrive as props for the same reason, and this is
 * the constraint to respect when adding an action: rendering in the shared header
 * means rendering **outside the plugin's `QueryClientProvider`**, so anything backed
 * by react-query — every read, probe or mutation — has to be called by the page and
 * passed down. Calling `useDeleteSession` here throws "No QueryClient set".
 *
 * Rename is the exception to the self-contained-unit rule above, and takes an
 * `onRename` callback instead of owning its dialog: the page title opens the same
 * dialog, so its state has to live somewhere both can reach — which is the page.
 */
export function SessionActionsMenu({
  title,
  deletion,
  onRename,
  isUserScoped,
}: {
  /** The session's display title, for the dialog and the toast. */
  title: string;
  deletion: UseDeleteSessionResult;
  /** Opens the page's rename dialog. */
  onRename: () => void;
  isUserScoped?: boolean;
}) {
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const sessionsRoute = useRouteRef(sessionsRouteRef);

  const { deleteSession, isDeleting, error, reset } = deletion;

  const openDeleteDialog = () => {
    // Clear a previous attempt's error, so the dialog does not open still
    // showing it.
    reset();
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteSession();
    } catch {
      // Left to the dialog, which stays open and renders the hook's `error`. No
      // toast: the user is still looking at the modal they pressed Delete in.
      return;
    }

    setDeleteOpen(false);
    // Plainly past tense, unlike the agent's "Deleting…": kagent's delete is
    // synchronous, so by the time this resolves the session is already filtered out
    // of every read. Nothing is still settling in the background.
    toastApi.post({
      title: `Session "${title}" deleted`,
      status: 'success',
      // A ToastApi toast without a timeout is permanent, and this is an
      // acknowledgement, not something to dismiss by hand.
      timeout: TOAST_TIMEOUT_MS,
    });

    // An unbound route means the Agent Platform extension is disabled — in which
    // case this page is not rendering either. Staying put beats hardcoding a
    // path that would silently rot if the route moved.
    if (sessionsRoute) {
      navigate(sessionsRoute());
    }
  };

  return (
    <>
      <MenuTrigger>
        <ButtonIcon
          icon={<MoreVertIcon />}
          aria-label="Session actions"
          variant="tertiary"
        />
        <Menu maxWidth={MENU_WIDTH}>
          <MenuItem iconStart={<EditOutlinedIcon />} onAction={onRename}>
            Rename session…
          </MenuItem>
          <MenuItem
            color="danger"
            iconStart={<DeleteOutlineIcon />}
            onAction={openDeleteDialog}
          >
            Delete session…
          </MenuItem>
        </Menu>
      </MenuTrigger>

      <SessionDeleteDialog
        title={title}
        isOpen={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        isDeleting={isDeleting}
        error={error?.message}
        onConfirm={confirmDelete}
        isUserScoped={isUserScoped}
      />
    </>
  );
}
