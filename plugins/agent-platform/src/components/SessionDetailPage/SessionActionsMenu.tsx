import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import {
  ButtonIcon,
  Menu,
  MenuItem,
  MenuTrigger,
  SubmenuTrigger,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import EditOutlinedIcon from '@material-ui/icons/EditOutlined';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import NotificationsNoneOutlinedIcon from '@material-ui/icons/NotificationsNoneOutlined';
import {
  MENU_WIDTH,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import { RuntimeLoss } from '@giantswarm/backstage-plugin-agent-platform-common';
import type { UseDeleteSessionResult } from '../../hooks/useDeleteSession';
import { sessionsRouteRef } from '../../routes';
import type { NotificationLevel } from '../../lib/notificationRecord';
import { PinIcon } from '../PinIcon';
import {
  describeSessionDeleteFailure,
  SessionDeleteDialog,
} from './SessionDeleteDialog';

/** Long enough to read one line, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/** The Notifications submenu's choices, in the order the menu lists them. */
const NOTIFICATION_LEVEL_LABELS: ReadonlyArray<[NotificationLevel, string]> = [
  ['default', 'Default'],
  ['all', 'All activity'],
  ['muted', 'Muted'],
];

const useStyles = makeStyles({
  // The tick's place, kept empty on the unticked choices so their labels
  // line up with the ticked one.
  tick: {
    display: 'inline-flex',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    '& svg': { width: '1rem', height: '1rem' },
  },
});

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
  runtimeLoss,
  triggerLabel = 'Session actions',
  onDeleted,
  pin,
  notifications,
}: {
  /** The session's display title, for the dialog and the toast. */
  title: string;
  deletion: UseDeleteSessionResult;
  /** Opens the page's rename dialog. */
  onRename: () => void;
  isUserScoped?: boolean;
  /**
   * The session's runtime is lost, as the page reads it. Only the wording of
   * a *failed* delete depends on it — see `describeSessionDeleteFailure`.
   */
  runtimeLoss?: RuntimeLoss;
  /** The menu button's accessible name; a list names the session in it. */
  triggerLabel?: string;
  /**
   * Called once the session is deleted, for a list to move focus off the
   * row that held this menu.
   */
  onDeleted?: () => void;
  /**
   * The session's pin toggle, before the menu — the prototype's header pin.
   * Pinned sessions lead the shell rail and the sessions list. Absent where
   * pins show nowhere (classic chrome) and in a list, whose rows carry their
   * own.
   */
  pin?: { isPinned: boolean; onToggle: () => void };
  /**
   * The session's Notification level and its setter, for the menu's
   * Notifications submenu (Default / All activity / Muted, the current one
   * ticked). `level` is undefined until the stored level has been read, and
   * then nothing is ticked. A failed write is reported here, in a toast.
   * Absent: no Notifications item.
   */
  notifications?: {
    level: NotificationLevel | undefined;
    onChange: (level: NotificationLevel) => Promise<void>;
  };
}) {
  const classes = useStyles();
  const isPhone = usePhoneLayout();
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
    // From the list itself there is nowhere to go: the row is already gone.
    const sessionsPath = sessionsRoute?.();
    if (sessionsPath && sessionsPath !== pathname) {
      navigate(sessionsPath);
    }
    onDeleted?.();
  };

  const chooseLevel = (level: NotificationLevel) => {
    if (!notifications || level === notifications.level) {
      return;
    }
    notifications.onChange(level).catch(() => {
      // The tick stays on the stored level; say why the choice did not hold.
      toastApi.post({
        title: 'Could not change the session’s notifications',
        status: 'danger',
        timeout: TOAST_TIMEOUT_MS,
      });
    });
  };

  return (
    <>
      {pin && (
        <ButtonIcon
          icon={<PinIcon filled={pin.isPinned} size={17} />}
          aria-pressed={pin.isPinned}
          aria-label={pin.isPinned ? 'Unpin session' : 'Pin session'}
          variant="tertiary"
          onPress={pin.onToggle}
        />
      )}
      <MenuTrigger>
        <ButtonIcon
          icon={<MoreVertIcon />}
          aria-label={triggerLabel}
          variant="tertiary"
        />
        <Menu maxWidth={MENU_WIDTH}>
          <MenuItem iconStart={<EditOutlinedIcon />} onAction={onRename}>
            Rename session…
          </MenuItem>
          {notifications && (
            <SubmenuTrigger>
              <MenuItem iconStart={<NotificationsNoneOutlinedIcon />}>
                Notifications
              </MenuItem>
              <Menu
                maxWidth={MENU_WIDTH}
                // Beside the menu, towards the page: the menu sits at the
                // right edge, so the default end side has no room and the
                // submenu would drop over the menu's own items. A phone is
                // too narrow for two menus side by side; there it takes the
                // default and opens over the menu.
                placement={isPhone ? undefined : 'start top'}
                aria-label="Notifications"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={notifications.level ? [notifications.level] : []}
                onSelectionChange={keys => {
                  if (keys === 'all') {
                    return;
                  }
                  const [level] = [...keys];
                  if (level !== undefined) {
                    chooseLevel(level as NotificationLevel);
                  }
                }}
              >
                {NOTIFICATION_LEVEL_LABELS.map(([level, label]) => (
                  <MenuItem
                    key={level}
                    id={level}
                    iconStart={
                      <span className={classes.tick} aria-hidden>
                        {level === notifications.level && <CheckIcon />}
                      </span>
                    }
                  >
                    {label}
                  </MenuItem>
                ))}
              </Menu>
            </SubmenuTrigger>
          )}
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
        error={
          error ? describeSessionDeleteFailure(error, runtimeLoss) : undefined
        }
        onConfirm={confirmDelete}
        isUserScoped={isUserScoped}
      />
    </>
  );
}
