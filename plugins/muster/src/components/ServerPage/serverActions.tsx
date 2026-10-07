import { makeStyles } from '@material-ui/core';
import { Alert, Text, TextAreaField } from '@backstage/ui';
import {
  ConfirmDialog,
  useOnDialogOpen,
} from '@giantswarm/backstage-plugin-ui-react';
import { useApi } from '@backstage/core-plugin-api';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { musterApiRef } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import { toMcpServerDefinition } from '../../lib/gitops';
import { mutationErrorMessage } from '../../lib/authError';
import { useMusterMutationRefresh } from '../MusterInstanceProvider';
import { DefinitionEditorDialog } from '../shared';

const useStyles = makeStyles({
  editField: {
    '& textarea': {
      fontFamily: 'monospace',
      fontSize: 12,
    },
  },
});

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
  const mutation = useTrackedMutation({
    event: null,
    untrackedReason:
      'Server lifecycle changes and deletion are not a tracked portal action yet.',
    mutationFn: (live: LiveAction) =>
      musterApi.callTool(live.tool, live.args, server.cluster),
    onSuccess: (_result, live) => {
      // muster writes the CR synchronously, so refetching now shows the spec
      // change (e.g. the Activate/Deactivate swap) instead of waiting for the
      // next 30s poll.
      refresh();
      onDone?.(live);
    },
  });

  // Reset on open, not on close: the dialog keeps rendering while it fades
  // out, and `action` stays set for that reason too.
  useOnDialogOpen(open, () => mutation.reset());

  const run = () => {
    if (action) {
      mutation.mutate(action);
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
      isBusy={mutation.isPending}
      error={mutation.error ? mutationErrorMessage(mutation.error) : undefined}
      isDone={mutation.isSuccess}
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
      {mutation.isSuccess && (
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
 * `core_mcpserver_update`. New servers are added through the "Register server"
 * flow instead.
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
  return (
    <DefinitionEditorDialog
      open={open}
      onClose={onClose}
      installation={server.cluster}
      title={<>Edit as JSON — {server.getName()}</>}
      description="Edit the muster server."
      seed={() => JSON.stringify(toMcpServerDefinition(server), null, 2)}
      parse={parseJsonDefinition}
      renderEditor={({ value, onChange }) => (
        <TextAreaField
          label="Server definition (JSON)"
          className={classes.editField}
          rows={12}
          value={value}
          onChange={onChange}
        />
      )}
      validateTool="core_mcpserver_validate"
      saveTool="core_mcpserver_update"
      saveUntrackedReason="An edit of a server, not an addition."
      savedMessage="Saved. The server list has been refreshed."
    />
  );
}

function parseJsonDefinition(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }
}

/**
 * Why Reconnect is not offered for an OAuth server waiting on a per-user
 * sign-in (see `serverLiveActions`).
 */
export const OAUTH_SIGN_IN_GATE =
  'This server authenticates per user session (OAuth), and reconnecting ' +
  'cannot sign a session in — muster refuses it. Use “Sign in” in the ' +
  'page header instead.';

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
