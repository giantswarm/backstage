import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import GitHub from '@material-ui/icons/GitHub';
import Edit from '@material-ui/icons/Edit';
import DeleteOutline from '@material-ui/icons/DeleteOutline';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Stop from '@material-ui/icons/Stop';
import Replay from '@material-ui/icons/Replay';
import { useApi } from '@backstage/core-plugin-api';
import { musterApiRef } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import {
  isGitOpsManaged,
  provenanceReleaseId,
  readProvenance,
  toManifestYaml,
  toMcpServerDefinition,
} from '../../lib/gitops';
import { classifyTool } from '../../lib/mutationGuard';
import { StateBadge } from '../shared';

const useStyles = makeStyles((theme: Theme) => ({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  managedNote: {
    color: theme.palette.text.secondary,
    flex: 1,
    minWidth: 200,
  },
  manifest: {
    whiteSpace: 'pre',
    overflowX: 'auto',
    fontFamily: 'monospace',
    fontSize: 12,
    margin: 0,
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.action.hover,
  },
  editField: {
    '& textarea': {
      fontFamily: 'monospace',
      fontSize: 12,
    },
  },
  error: {
    color: theme.palette.error.main,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  ok: {
    color: theme.palette.success.main,
  },
}));

/**
 * GitOps "manifest to commit" dialog: GitOps-managed servers are read-only in
 * the app, so Add/Edit/Delete produce a manifest the operator commits to the
 * management-clusters repo (a PR), never a live mutation. Shows the rendered
 * MCPServer manifest and the managing HelmRelease.
 */
function GitOpsManifestDialog({
  server,
  open,
  intent,
  onClose,
}: {
  server: MCPServer;
  open: boolean;
  intent: 'edit' | 'delete';
  onClose: () => void;
}) {
  const classes = useStyles();
  const releaseId = provenanceReleaseId(readProvenance(server));
  const manifest = toManifestYaml(server);

  const copy = () => {
    navigator.clipboard?.writeText(manifest).catch(() => undefined);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {intent === 'delete' ? 'Remove via GitOps' : 'Edit via GitOps'} —{' '}
        {server.getName()}
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          This server is <strong>GitOps-managed</strong>
          {releaseId ? (
            <>
              {' '}
              by HelmRelease <code>{releaseId}</code>
            </>
          ) : null}
          . Live changes would be reverted by the reconciler, so they are
          read-only here.{' '}
          {intent === 'delete'
            ? 'To remove it, delete its manifest in the management-clusters GitOps repo and open a PR.'
            : 'To change it, edit its manifest in the management-clusters GitOps repo and open a PR.'}
        </DialogContentText>
        <Box mt={2}>
          <Typography variant="caption" color="textSecondary">
            Current manifest
          </Typography>
          <pre className={classes.manifest}>{manifest}</pre>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={copy}>Copy manifest</Button>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type LiveAction = {
  label: string;
  tool: string;
  args: Record<string, unknown>;
  destructive?: boolean;
};

/**
 * Confirm dialog for a live mutation against an ad-hoc server. On confirm it
 * runs the muster tool through the guarded `/call` proxy route; the backend
 * still enforces `allowMutations`, so a read-only installation surfaces the
 * 403 here rather than silently succeeding.
 */
function ConfirmActionDialog({
  server,
  action,
  open,
  onClose,
}: {
  server: MCPServer;
  action: LiveAction | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const reset = () => {
    setError(undefined);
    setDone(false);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const run = async () => {
    if (!action) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await musterApi.callTool(action.tool, action.args, server.cluster);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{action?.label}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          {action?.destructive ? (
            <>
              This permanently removes the ad-hoc server{' '}
              <code>{server.getName()}</code> from this muster instance. This is
              a live mutation and cannot be undone.
            </>
          ) : (
            <>
              Run <code>{action?.tool}</code> against <code>{server.getName()}</code>{' '}
              on installation <code>{server.cluster}</code>. This is a live
              mutation.
            </>
          )}
        </DialogContentText>
        {error && (
          <Box mt={2}>
            <Typography variant="body2" className={classes.error}>
              {error}
            </Typography>
          </Box>
        )}
        {done && (
          <Box mt={2}>
            <Typography variant="body2" className={classes.ok}>
              Done. The change may take a moment to reflect in the CRD list.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{done ? 'Close' : 'Cancel'}</Button>
        {!done && (
          <Button
            onClick={run}
            color="secondary"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={14} /> : undefined}
          >
            {action?.destructive ? 'Delete' : 'Confirm'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

const NEW_SERVER_TEMPLATE = {
  name: 'my-server',
  type: 'streamable-http',
  description: '',
  autoStart: true,
  url: 'https://example.com/mcp',
  timeout: 30,
};

/**
 * Ad-hoc server dialog: a JSON editor validated via `core_mcpserver_validate`
 * and saved via `core_mcpserver_create` (when `server` is absent) or
 * `core_mcpserver_update` (editing an existing ad-hoc server). Both calls go
 * through the guarded proxy (subject to `allowMutations`).
 */
export function AdHocServerDialog({
  installation,
  server,
  open,
  onClose,
}: {
  installation?: string;
  server?: MCPServer;
  open: boolean;
  onClose: () => void;
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const isEdit = Boolean(server);
  const target = server?.cluster ?? installation;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  // Seed the editor when the dialog opens.
  const seed = () => {
    setValue(
      JSON.stringify(
        server ? toMcpServerDefinition(server) : NEW_SERVER_TEMPLATE,
        null,
        2,
      ),
    );
    setError(undefined);
    setMessage(undefined);
  };

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
    setBusy(true);
    setMessage(undefined);
    try {
      await musterApi.callTool('core_mcpserver_validate', def, target);
      setMessage('Definition is valid.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const def = parsed();
    if (!def) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      await musterApi.callTool(
        isEdit ? 'core_mcpserver_update' : 'core_mcpserver_create',
        def,
        target,
      );
      setMessage('Saved. The CRD list will refresh shortly.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      TransitionProps={{ onEnter: seed }}
    >
      <DialogTitle>
        {isEdit
          ? `Edit ad-hoc server — ${server?.getName()}`
          : 'Add ad-hoc server'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {isEdit ? 'Edit' : 'Define'} the muster server. Validate before
          saving; both run as live mutations against installation{' '}
          <code>{target}</code>.
        </DialogContentText>
        <TextField
          className={classes.editField}
          multiline
          minRows={12}
          fullWidth
          variant="outlined"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        {error && (
          <Typography variant="body2" className={classes.error}>
            {error}
          </Typography>
        )}
        {message && (
          <Typography variant="body2" className={classes.ok}>
            {message}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={validate} disabled={busy}>
          Validate
        </Button>
        <Button
          onClick={save}
          color="secondary"
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={14} /> : undefined}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export interface ServerMutationActionsProps {
  server: MCPServer;
  /** Whether the active installation opts into live mutations. */
  allowMutations: boolean;
}

/**
 * Lifecycle/CRUD affordances for one server, gitops-aware (decided 2026-06-27):
 * GitOps-managed servers are read-only and route Add/Edit/Delete through a
 * GitOps PR/manifest; ad-hoc servers allow live core_mcpserver_* CRUD + service
 * start/stop/restart, behind the mutation guard + a confirm dialog. The backend
 * proxy still enforces `allowMutations`, so this is defence-in-depth, not the
 * only gate.
 */
export function ServerMutationActions({
  server,
  allowMutations,
}: ServerMutationActionsProps) {
  const classes = useStyles();
  const managed = isGitOpsManaged(server);

  const [gitopsIntent, setGitopsIntent] = useState<'edit' | 'delete' | null>(
    null,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [action, setAction] = useState<LiveAction | undefined>();

  if (managed) {
    return (
      <Box className={classes.actions}>
        <StateBadge tone="info" label="GitOps-managed (read-only)" />
        <Typography variant="body2" className={classes.managedNote}>
          Changes are made by committing a manifest to the GitOps repo.
        </Typography>
        <Button
          size="small"
          startIcon={<GitHub />}
          onClick={() => setGitopsIntent('edit')}
        >
          Edit via GitOps
        </Button>
        <Button
          size="small"
          startIcon={<DeleteOutline />}
          onClick={() => setGitopsIntent('delete')}
        >
          Remove via GitOps
        </Button>
        <GitOpsManifestDialog
          server={server}
          open={gitopsIntent !== null}
          intent={gitopsIntent ?? 'edit'}
          onClose={() => setGitopsIntent(null)}
        />
      </Box>
    );
  }

  // Ad-hoc server: live CRUD + service lifecycle, behind the mutation guard.
  const deleteRisk = classifyTool('core_mcpserver_delete');
  const liveAllowed = allowMutations && deleteRisk !== 'blocked';

  return (
    <Box className={classes.actions}>
      <StateBadge tone="neutral" label="Ad-hoc (live CRUD)" />
      {!liveAllowed && (
        <Typography variant="body2" className={classes.managedNote}>
          This installation is read-only; enable <code>allowMutations</code> to
          edit, delete, or restart ad-hoc servers live.
        </Typography>
      )}
      <Button
        size="small"
        startIcon={<Edit />}
        disabled={!liveAllowed}
        onClick={() => setEditOpen(true)}
      >
        Edit
      </Button>
      <Button
        size="small"
        startIcon={<PlayArrow />}
        disabled={!liveAllowed}
        onClick={() =>
          setAction({
            label: `Start ${server.getName()}`,
            tool: 'core_service_start',
            args: { name: server.getName() },
          })
        }
      >
        Start
      </Button>
      <Button
        size="small"
        startIcon={<Stop />}
        disabled={!liveAllowed}
        onClick={() =>
          setAction({
            label: `Stop ${server.getName()}`,
            tool: 'core_service_stop',
            args: { name: server.getName() },
          })
        }
      >
        Stop
      </Button>
      <Button
        size="small"
        startIcon={<Replay />}
        disabled={!liveAllowed}
        onClick={() =>
          setAction({
            label: `Restart ${server.getName()}`,
            tool: 'core_service_restart',
            args: { name: server.getName() },
          })
        }
      >
        Restart
      </Button>
      <Button
        size="small"
        startIcon={<DeleteOutline />}
        disabled={!liveAllowed}
        onClick={() =>
          setAction({
            label: `Delete ${server.getName()}`,
            tool: 'core_mcpserver_delete',
            args: { name: server.getName() },
            destructive: true,
          })
        }
      >
        Delete
      </Button>

      <AdHocServerDialog
        server={server}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <ConfirmActionDialog
        server={server}
        action={action}
        open={action !== undefined}
        onClose={() => setAction(undefined)}
      />
    </Box>
  );
}

/**
 * Section-level "Add server" affordance. Adding a standard/fleet server is a
 * GitOps change (a manifest committed to the management-clusters repo); only
 * ad-hoc servers can be created live through muster, behind `allowMutations`.
 */
export function AddAdHocServerButton({
  installation,
  allowMutations,
}: {
  installation?: string;
  allowMutations: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="small"
        startIcon={<Edit />}
        disabled={!allowMutations}
        onClick={() => setOpen(true)}
        title={
          allowMutations
            ? 'Create a live ad-hoc MCP server'
            : 'Read-only installation: add fleet servers via a GitOps PR'
        }
      >
        Add ad-hoc server
      </Button>
      <AdHocServerDialog
        installation={installation}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
