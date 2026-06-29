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
import Add from '@material-ui/icons/Add';
import Tooltip from '@material-ui/core/Tooltip';
import { useApi } from '@backstage/core-plugin-api';
import { musterApiRef } from '../../apis';
import { MusterWorkflow } from '../../lib/k8s';
import {
  isGitOpsManaged,
  provenanceReleaseId,
  readProvenance,
  toManifestYaml,
  toWorkflowDefinition,
} from '../../lib/gitops';
import { mutationErrorMessage } from '../../lib/authError';
import { StateBadge } from '../shared';

const useStyles = makeStyles((theme: Theme) => ({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
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
 * GitOps "manifest to commit" dialog: GitOps-managed workflows are read-only in
 * the app, so Edit/Remove produce a manifest the operator commits to the
 * management-clusters repo (a PR), never a live mutation. Shows the rendered
 * Workflow manifest and the managing HelmRelease.
 */
function GitOpsManifestDialog({
  workflow,
  open,
  intent,
  onClose,
}: {
  workflow: MusterWorkflow;
  open: boolean;
  intent: 'edit' | 'delete';
  onClose: () => void;
}) {
  const classes = useStyles();
  const releaseId = provenanceReleaseId(readProvenance(workflow));
  const manifest = toManifestYaml(workflow);

  const copy = () => {
    navigator.clipboard?.writeText(manifest).catch(() => undefined);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {intent === 'delete' ? 'Remove via GitOps' : 'Edit via GitOps'} —{' '}
        {workflow.getName()}
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          This workflow is <strong>GitOps-managed</strong>
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

/**
 * Confirm dialog for deleting an ad-hoc (manually added) workflow. On confirm
 * it runs `core_workflow_delete` through the `/call` proxy.
 */
function ConfirmDeleteDialog({
  workflow,
  open,
  onClose,
}: {
  workflow: MusterWorkflow;
  open: boolean;
  onClose: () => void;
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const handleClose = () => {
    setError(undefined);
    setDone(false);
    setBusy(false);
    onClose();
  };

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await musterApi.callTool(
        'core_workflow_delete',
        { name: workflow.getName() },
        workflow.cluster,
      );
      setDone(true);
    } catch (e) {
      setError(mutationErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Delete {workflow.getName()}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          This permanently removes the ad-hoc workflow{' '}
          <code>{workflow.getName()}</code> from this muster instance. This is a
          live mutation and cannot be undone.
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
            Delete
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

const NEW_WORKFLOW_TEMPLATE = {
  name: 'my-workflow',
  description: '',
  args: {},
  steps: [{ id: 'step1', tool: 'core_service_list', args: {} }],
};

/**
 * Ad-hoc workflow dialog: a JSON editor validated via `core_workflow_validate`
 * and saved via `core_workflow_create` (when `workflow` is absent) or
 * `core_workflow_update` (editing an existing ad-hoc workflow). Both calls go
 * through the `/call` proxy. Mirrors the MCP-server `AdHocServerDialog`.
 */
export function AdHocWorkflowDialog({
  installation,
  workflow,
  open,
  onClose,
}: {
  installation?: string;
  workflow?: MusterWorkflow;
  open: boolean;
  onClose: () => void;
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const isEdit = Boolean(workflow);
  const target = workflow?.cluster ?? installation;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  // Seed the editor when the dialog opens.
  const seed = () => {
    setValue(
      JSON.stringify(
        workflow ? toWorkflowDefinition(workflow) : NEW_WORKFLOW_TEMPLATE,
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
      await musterApi.callTool('core_workflow_validate', def, target);
      setMessage('Definition is valid.');
    } catch (e) {
      setError(mutationErrorMessage(e));
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
        isEdit ? 'core_workflow_update' : 'core_workflow_create',
        def,
        target,
      );
      setMessage('Saved. The CRD list will refresh shortly.');
    } catch (e) {
      setError(mutationErrorMessage(e));
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
          ? `Edit ad-hoc workflow — ${workflow?.getName()}`
          : 'Create workflow'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {isEdit ? 'Edit' : 'Define'} the muster workflow (name, optional
          description/args, and steps). Validate before saving; both run as live
          mutations against installation <code>{target}</code>.
        </DialogContentText>
        <TextField
          className={classes.editField}
          multiline
          minRows={16}
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

export interface WorkflowMutationActionsProps {
  workflow: MusterWorkflow;
}

/**
 * Provenance-aware CRUD affordances for one workflow. Provenance is the only
 * restriction: GitOps-managed workflows are read-only and route Edit/Remove
 * through a GitOps PR/manifest; manually-added (ad-hoc) workflows allow live
 * `core_workflow_*` CRUD behind a confirm dialog. Mirrors
 * `ServerMutationActions`.
 */
export function WorkflowMutationActions({
  workflow,
}: WorkflowMutationActionsProps) {
  const classes = useStyles();
  const managed = isGitOpsManaged(workflow);

  const [gitopsIntent, setGitopsIntent] = useState<'edit' | 'delete' | null>(
    null,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
          workflow={workflow}
          open={gitopsIntent !== null}
          intent={gitopsIntent ?? 'edit'}
          onClose={() => setGitopsIntent(null)}
        />
      </Box>
    );
  }

  // Manually-added (ad-hoc) workflow: live CRUD.
  return (
    <Box className={classes.actions}>
      <StateBadge tone="neutral" label="Manually added" />
      <Button
        size="small"
        startIcon={<Edit />}
        onClick={() => setEditOpen(true)}
      >
        Edit
      </Button>
      <Button
        size="small"
        startIcon={<DeleteOutline />}
        onClick={() => setDeleteOpen(true)}
      >
        Delete
      </Button>

      <AdHocWorkflowDialog
        workflow={workflow}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <ConfirmDeleteDialog
        workflow={workflow}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </Box>
  );
}

/**
 * Section-level "Create workflow" affordance: a manually-added (ad-hoc)
 * workflow is created live through muster. GitOps-managed workflows are created
 * by committing a manifest to the management-clusters repo instead.
 */
export function CreateWorkflowButton({
  installation,
  authenticated = true,
}: {
  installation?: string;
  /**
   * Whether there is an authenticated muster session for this installation.
   * Creating a workflow runs `core_workflow_*` live through muster, which needs
   * a session -- so it is disabled (with an explanatory tooltip) when there is
   * none, rather than failing with a raw 401 after the user composes a
   * definition.
   */
  authenticated?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const button = (
    <Button
      size="small"
      variant="outlined"
      startIcon={<Add />}
      onClick={() => setOpen(true)}
      disabled={!authenticated}
      title="Create a live ad-hoc workflow"
    >
      Create workflow
    </Button>
  );
  return (
    <>
      {authenticated ? (
        button
      ) : (
        <Tooltip title="Connect to muster (sign in) to create a workflow.">
          {/* span wrapper so the tooltip still fires over the disabled button */}
          <span>{button}</span>
        </Tooltip>
      )}
      <AdHocWorkflowDialog
        installation={installation}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
