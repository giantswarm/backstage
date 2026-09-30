import { useState } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
  TextAreaField,
} from '@backstage/ui';
import {
  ALERT_MESSAGE_STYLE,
  ConfirmDialog,
  useOnDialogOpen,
} from '@giantswarm/backstage-plugin-ui-react';
import Edit from '@material-ui/icons/Edit';
import DeleteOutline from '@material-ui/icons/DeleteOutline';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Stop from '@material-ui/icons/Stop';
import Replay from '@material-ui/icons/Replay';
// MUI's Tooltip, not bui's: bui wraps react-aria's TooltipTrigger, and a
// disabled bui Button renders a native `disabled` button, which fires neither
// hover nor focus -- so the react-aria tooltip could never open on exactly the
// buttons whose disabled state it exists to explain.
import Tooltip from '@material-ui/core/Tooltip';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { musterApiRef } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import { isGitOpsManaged, toMcpServerDefinition } from '../../lib/gitops';
import { wizardEditBlocker } from '../../lib/mcpServerDefinition';
import { newMcpServerRouteRef } from '../../routes';
import { mutationErrorMessage } from '../../lib/authError';
import { useMusterMutationRefresh } from '../MusterInstanceProvider';
import { withEditParam } from '../NewMcpServerEditGate';
import {
  DEACTIVATED_SIGN_IN_GATE,
  ServerAuthActions,
  StateBadge,
} from '../shared';
import { GitOpsServerActions } from './GitOpsServerActions';

const useStyles = makeStyles((theme: Theme) => ({
  actions: {
    flexWrap: 'wrap',
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  editField: {
    '& textarea': {
      fontFamily: 'monospace',
      fontSize: 12,
    },
  },
}));

export type LiveAction = {
  label: string;
  tool: string;
  args: Record<string, unknown>;
  /** One sentence saying what muster will actually do (shown in the confirm dialog). */
  description?: string;
  destructive?: boolean;
};

/**
 * Confirm dialog for a live mutation against an ad-hoc (manually added) server.
 * On confirm it runs the muster tool through the `/call` proxy route. Only
 * Delete gets the destructive treatment: the lifecycle actions are undone by
 * their counterpart (Deactivate by Activate).
 */
export function ConfirmActionDialog({
  server,
  action,
  open,
  onClose,
  onDone,
}: {
  server: MCPServer;
  action: LiveAction | undefined;
  open: boolean;
  onClose: () => void;
  /** Called once muster has carried the action out. */
  onDone?: (action: LiveAction) => void;
}) {
  const musterApi = useApi(musterApiRef);
  const refresh = useMusterMutationRefresh(server.cluster);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  // Reset on open, not on close: the dialog keeps rendering while it fades
  // out, and `action` stays set for that reason too.
  useOnDialogOpen(open, () => {
    setError(undefined);
    setDone(false);
  });

  const run = async () => {
    if (!action) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await musterApi.callTool(action.tool, action.args, server.cluster);
      // muster writes the CR synchronously, so refetching now shows the spec
      // change (e.g. the Activate/Deactivate swap) instead of waiting for the
      // next 30s poll.
      refresh();
      setDone(true);
      onDone?.(action);
    } catch (e) {
      setError(mutationErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      isOpen={open}
      onOpenChange={next => {
        if (!next) {
          onClose();
        }
      }}
      title={action?.label ?? ''}
      confirmLabel={action?.destructive ? 'Delete' : 'Confirm'}
      destructive={action?.destructive}
      isBusy={busy}
      error={error}
      isDone={done}
      onConfirm={run}
    >
      <Text as="p" variant="body-medium">
        {action?.destructive ? (
          <>
            This permanently removes the server <code>{server.getName()}</code>{' '}
            from this muster instance. This is a live mutation and cannot be
            undone.
          </>
        ) : (
          <>
            {action?.description ? `${action.description} ` : ''}
            Runs <code>{action?.tool}</code> against{' '}
            <code>{server.getName()}</code> on installation{' '}
            <code>{server.cluster}</code>.
          </>
        )}
      </Text>
      {done && (
        <Alert
          status="success"
          description="Done. The server list has been refreshed; the connection status may take a few seconds to settle."
        />
      )}
    </ConfirmDialog>
  );
}

/**
 * Ad-hoc server edit dialog: a JSON editor seeded from the existing server,
 * validated via `core_mcpserver_validate` and saved via
 * `core_mcpserver_update`. Both calls go through the `/call` proxy. New servers
 * are added through the "Register server" flow instead.
 */
export function AdHocServerDialog({
  server,
  open,
  onClose,
}: {
  server: MCPServer;
  open: boolean;
  onClose: () => void;
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const target = server.cluster;
  const refresh = useMusterMutationRefresh(target);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<'validate' | 'save'>();
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  // Seeded on open only: `server` is polled, and re-seeding on every refetch
  // would overwrite what the user is typing.
  useOnDialogOpen(open, () => {
    setValue(JSON.stringify(toMcpServerDefinition(server), null, 2));
    setError(undefined);
    setMessage(undefined);
  });

  const parsed = (): Record<string, unknown> | undefined => {
    try {
      const obj = JSON.parse(value);
      setError(undefined);
      return obj;
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`);
      return undefined;
    }
  };

  const validate = async () => {
    const def = parsed();
    if (!def) {
      return;
    }
    setBusy('validate');
    setMessage(undefined);
    try {
      await musterApi.callTool('core_mcpserver_validate', def, target);
      setMessage('Definition is valid.');
    } catch (e) {
      setError(mutationErrorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };

  const save = async () => {
    const def = parsed();
    if (!def) {
      return;
    }
    setBusy('save');
    setMessage(undefined);
    try {
      await musterApi.callTool('core_mcpserver_update', def, target);
      refresh();
      setMessage('Saved. The server list has been refreshed.');
    } catch (e) {
      setError(mutationErrorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Dialog
      isOpen={open}
      // Gated here as well: DialogHeader's close button ignores isDismissable.
      onOpenChange={next => {
        if (!next && !busy) {
          onClose();
        }
      }}
      isDismissable={!busy}
      isKeyboardDismissDisabled={Boolean(busy)}
      width="min(90vw, 860px)"
    >
      <DialogHeader>Edit as JSON — {server.getName()}</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-medium">
            Edit the muster server. Validate before saving; both run as live
            mutations against installation <code>{target}</code>.
          </Text>
          <TextAreaField
            label="Server definition (JSON)"
            className={classes.editField}
            rows={12}
            value={value}
            onChange={setValue}
          />
          {error && (
            <Alert
              status="danger"
              description={<span style={ALERT_MESSAGE_STYLE}>{error}</span>}
            />
          )}
          {message && <Alert status="success" description={message} />}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          isDisabled={Boolean(busy)}
          onPress={onClose}
        >
          Close
        </Button>
        <Button
          variant="secondary"
          isDisabled={Boolean(busy)}
          isPending={busy === 'validate'}
          onPress={validate}
        >
          Validate
        </Button>
        <Button
          variant="primary"
          isDisabled={Boolean(busy)}
          isPending={busy === 'save'}
          onPress={save}
        >
          Save
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export interface ServerMutationActionsProps {
  server: MCPServer;
  /**
   * Whether there is an authenticated muster session for this installation.
   * The per-server sign-in/sign-out affordance is scoped to that session, and
   * without one the status read behind it would just 401.
   */
  authenticated?: boolean;
}

/**
 * Explanation shown on Reconnect when muster would refuse it for an OAuth
 * server waiting on a per-user sign-in (see oauthSignInGated below).
 */
export const OAUTH_SIGN_IN_GATE =
  'This server authenticates per user session (OAuth), and reconnecting ' +
  'cannot sign a session in — muster refuses it. Use “Sign in” in this ' +
  'row instead.';

/**
 * The live lifecycle and CRUD actions muster offers for an ad-hoc server, each
 * as the tool call its confirm dialog runs. Activate and Deactivate are two
 * directions of one switch, so exactly one is set; Reconnect exists only for an
 * active server (muster refuses it while suspended) and carries the reason it
 * is refused for an OAuth server waiting on a per-user sign-in.
 */
export function serverLiveActions(server: MCPServer): {
  activate?: LiveAction;
  deactivate?: LiveAction;
  reconnect?: LiveAction;
  reconnectGate?: string;
  remove: LiveAction;
} {
  const name = server.getName();
  // muster refuses a reconnect (core_service_restart) for an OAuth server in
  // `Auth Required`: authentication is session-scoped, so only the sign-in
  // flow (core_auth_login) can connect it. The gate is deliberately
  // state-scoped, not `auth.type === 'oauth'` alone — reconnecting a failed
  // OAuth server is a valid retry.
  const oauthSignInGated =
    server.getAuth()?.type === 'oauth' && server.getState() === 'Auth Required';
  const remove: LiveAction = {
    label: `Delete ${name}`,
    tool: 'core_mcpserver_delete',
    args: { name },
    destructive: true,
  };
  if (server.getSuspended()) {
    return {
      activate: {
        label: `Activate ${name}`,
        tool: 'core_service_start',
        args: { name },
        description:
          'muster will resume maintaining a connection to this server.',
      },
      remove,
    };
  }
  return {
    deactivate: {
      label: `Deactivate ${name}`,
      tool: 'core_service_stop',
      args: { name },
      description:
        'muster will disconnect this server and keep it deactivated until it is activated again.',
    },
    reconnect: {
      label: `Reconnect ${name}`,
      tool: 'core_service_restart',
      args: { name },
      description:
        'muster will drop the current session to this server and establish a fresh one, re-running tool discovery.',
    },
    reconnectGate: oauthSignInGated ? OAUTH_SIGN_IN_GATE : undefined,
    remove,
  };
}

/** A row action button, disabled with an explanatory tooltip when gated. */
function LifecycleButton({
  label,
  icon,
  gateReason,
  onClick,
}: {
  label: string;
  icon: JSX.Element;
  gateReason?: string;
  onClick: () => void;
}) {
  const button = (
    <Button
      size="small"
      variant="secondary"
      iconStart={icon}
      onPress={onClick}
      isDisabled={Boolean(gateReason)}
    >
      {label}
    </Button>
  );
  if (!gateReason) {
    return button;
  }
  // The span carries the tooltip because the disabled button fires neither
  // hover nor focus. Focusable and labelled with the reason, so keyboard and
  // screen-reader users learn why the action is unavailable, not just that
  // it is. (The lint rule assumes a non-interactive element never needs
  // focus; this one stands in for the button that cannot take it.)
  return (
    <Tooltip title={gateReason}>
      <span
        role="group"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={`${label} (unavailable): ${gateReason}`}
      >
        {button}
      </span>
    </Tooltip>
  );
}

/**
 * Lifecycle/CRUD affordances for one server, gitops-aware. Provenance is the
 * only restriction: GitOps-managed servers are read-only and explain how to
 * edit or remove them in Git ({@link GitOpsServerActions}); manually-added (ad-hoc) servers
 * allow live core_mcpserver_* CRUD + lifecycle behind a confirm dialog. Edit
 * reopens the registration wizard pre-filled with the server, and saving there
 * updates it in place.
 *
 * The row also carries the per-session auth actions (Sign in / Sign out --
 * {@link ServerAuthActions}), in BOTH branches: signing in to an OAuth server
 * is a session action, not a CRD mutation, so GitOps provenance does not
 * restrict it. Sign in renders prominent (primary) because it is the single
 * action an Auth Required server needs, while everything else in the row is
 * secondary.
 *
 * The lifecycle verbs are named for what muster actually does with a remote
 * server, not for its start/stop/restart tool names (process vocabulary from
 * the stdio days): Deactivate suspends the connection durably
 * (`spec.suspended`), Activate resumes it, Reconnect drops and re-establishes
 * the session (fresh tool discovery). Activate/Deactivate are two directions
 * of one switch, so exactly one of them is shown, keyed on `spec.suspended`.
 * Reconnect only renders for an active server — muster refuses it while
 * suspended. Sign in is gated while suspended as well: muster's reconciler
 * undoes any connection the flow would make, so the row must not offer it.
 */
export function ServerMutationActions({
  server,
  authenticated,
}: ServerMutationActionsProps) {
  const classes = useStyles();
  const managed = isGitOpsManaged(server);
  const suspended = server.getSuspended();

  // Only for a server a user CAN sign in to -- a sigv4 server signs as
  // muster's own machine identity, and the auth-chain detail says so.
  const authActions =
    authenticated && server.canAuthenticateInteractively() ? (
      <ServerAuthActions
        serverName={server.getName()}
        installation={server.cluster}
        oauthConfigured={server.getAuth()?.type === 'oauth'}
        signInGate={suspended ? DEACTIVATED_SIGN_IN_GATE : undefined}
      />
    ) : null;

  const live = serverLiveActions(server);

  const navigate = useNavigate();
  const registerLink = useRouteRef(newMcpServerRouteRef);
  // The wizard seeds itself from `?edit=` (NewMcpServerEditGate), so the edit
  // survives a reload and a registration draft in progress is set aside, not
  // lost.
  const onEdit = () => {
    if (registerLink) {
      navigate(withEditParam(registerLink(), server.getName()));
    }
  };
  const editBlocker = wizardEditBlocker(server);
  const [jsonEditOpen, setJsonEditOpen] = useState(false);
  const [action, setAction] = useState<LiveAction | undefined>();
  const [actionOpen, setActionOpen] = useState(false);
  const openAction = (next: LiveAction) => {
    setAction(next);
    setActionOpen(true);
  };

  if (managed) {
    return (
      <GitOpsServerActions
        server={server}
        authActions={authActions}
        className={classes.actions}
      />
    );
  }

  // Manually-added (ad-hoc) server: live CRUD + service lifecycle.
  return (
    <Flex align="center" gap="2" className={classes.actions}>
      <StateBadge tone="neutral" label="Manually added" />
      {authActions}
      {editBlocker ? (
        // What the wizard cannot represent the JSON editor still can, so a
        // server the wizard refuses keeps an in-app edit path.
        <Tooltip title={editBlocker}>
          <span>
            <Button
              size="small"
              variant="secondary"
              iconStart={<Edit fontSize="inherit" />}
              onPress={() => setJsonEditOpen(true)}
            >
              Edit as JSON
            </Button>
          </span>
        </Tooltip>
      ) : (
        <Button
          size="small"
          variant="secondary"
          iconStart={<Edit fontSize="inherit" />}
          onPress={onEdit}
        >
          Edit
        </Button>
      )}
      {live.activate && (
        <Button
          size="small"
          variant="secondary"
          iconStart={<PlayArrow fontSize="inherit" />}
          onPress={() => openAction(live.activate!)}
        >
          Activate
        </Button>
      )}
      {live.deactivate && (
        <Button
          size="small"
          variant="secondary"
          iconStart={<Stop fontSize="inherit" />}
          onPress={() => openAction(live.deactivate!)}
        >
          Deactivate
        </Button>
      )}
      {live.reconnect && (
        <LifecycleButton
          label="Reconnect"
          icon={<Replay fontSize="inherit" />}
          gateReason={live.reconnectGate}
          onClick={() => openAction(live.reconnect!)}
        />
      )}
      <Button
        size="small"
        variant="secondary"
        destructive
        iconStart={<DeleteOutline fontSize="inherit" />}
        onPress={() => openAction(live.remove)}
      >
        Delete
      </Button>

      {editBlocker && (
        <AdHocServerDialog
          server={server}
          open={jsonEditOpen}
          onClose={() => setJsonEditOpen(false)}
        />
      )}
      <ConfirmActionDialog
        server={server}
        action={action}
        open={actionOpen}
        onClose={() => setActionOpen(false)}
      />
    </Flex>
  );
}
