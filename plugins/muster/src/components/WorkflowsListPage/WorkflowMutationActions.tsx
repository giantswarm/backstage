import { useState } from 'react';
import { dump, load } from 'js-yaml';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import Edit from '@material-ui/icons/Edit';
import DeleteOutline from '@material-ui/icons/DeleteOutline';
import Add from '@material-ui/icons/Add';
// MUI's Tooltip, not bui's: a disabled bui Button fires neither hover nor
// focus, so a react-aria tooltip could not explain why it is disabled.
import Tooltip from '@material-ui/core/Tooltip';
import { useApi } from '@backstage/core-plugin-api';
import {
  ALERT_MESSAGE_STYLE,
  ConfirmDialog,
  GitOpsManagedLabel,
  useOnDialogOpen,
  YamlEditorFormField,
} from '@giantswarm/backstage-plugin-ui-react';
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
import { useMusterMutationRefresh } from '../MusterInstanceProvider';

/**
 * GitOps "manifest to commit" dialog: GitOps-managed workflows are read-only in
 * the app, so changes are made by committing the manifest to the
 * management-clusters repo (a PR), never a live mutation. Shows the rendered
 * Workflow manifest and the managing HelmRelease.
 */
function GitOpsManifestDialog({
  workflow,
  open,
  onClose,
}: {
  workflow: MusterWorkflow;
  open: boolean;
  onClose: () => void;
}) {
  const releaseId = provenanceReleaseId(readProvenance(workflow));
  const manifest = toManifestYaml(workflow);

  const copy = () => {
    navigator.clipboard?.writeText(manifest).catch(() => undefined);
  };

  return (
    <Dialog
      isOpen={open}
      onOpenChange={next => {
        if (!next) {
          onClose();
        }
      }}
      width="min(90vw, 860px)"
    >
      <DialogHeader>Workflow manifest — {workflow.getName()}</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-medium">
            This workflow is <strong>GitOps-managed</strong>
            {releaseId ? (
              <>
                {' '}
                by HelmRelease <code>{releaseId}</code>
              </>
            ) : null}
            . Live changes would be reverted by the reconciler, so they are
            read-only here. To change it, edit its manifest in the
            management-clusters GitOps repo and open a PR.
          </Text>
          <YamlEditorFormField
            label="Current manifest"
            value={manifest}
            readOnly
            height={360}
            maxHeight={360}
          />
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={copy}>
          Copy manifest
        </Button>
        <Button variant="primary" onPress={onClose}>
          Close
        </Button>
      </DialogFooter>
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
  const musterApi = useApi(musterApiRef);
  const refresh = useMusterMutationRefresh(workflow.cluster);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  // Reset on open, not on close: the dialog keeps rendering while it fades out.
  useOnDialogOpen(open, () => {
    setError(undefined);
    setDone(false);
  });

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await musterApi.callTool(
        'core_workflow_delete',
        { name: workflow.getName() },
        workflow.cluster,
      );
      // muster deletes the CR synchronously, so refetching now removes the
      // row instead of waiting for the next 30s poll. The workflow list is
      // fed entirely by the provider's CRD reads (no runtime aggregator query
      // like the servers page), so the provider retry covers everything.
      refresh();
      setDone(true);
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
      title={`Delete ${workflow.getName()}`}
      confirmLabel="Delete"
      destructive
      isBusy={busy}
      error={error}
      isDone={done}
      onConfirm={run}
    >
      <Text as="p" variant="body-medium">
        This permanently removes the ad-hoc workflow{' '}
        <code>{workflow.getName()}</code> from this muster instance. This is a
        live mutation and cannot be undone.
      </Text>
      {done && (
        <Alert
          status="success"
          description="Done. The workflow list has been refreshed."
        />
      )}
    </ConfirmDialog>
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
 * through the `/call` proxy. The MCP-server edit dialog (`AdHocServerDialog`
 * in the server page's `serverActions`) follows the same shape, for editing
 * only.
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
  const musterApi = useApi(musterApiRef);
  const isEdit = Boolean(workflow);
  const target = workflow?.cluster ?? installation;
  const refresh = useMusterMutationRefresh(target);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<'validate' | 'save'>();
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  // Seeded on open only: `workflow` is polled, and re-seeding on every
  // refetch would overwrite what the user is typing.
  useOnDialogOpen(open, () => {
    setValue(
      dump(workflow ? toWorkflowDefinition(workflow) : NEW_WORKFLOW_TEMPLATE, {
        lineWidth: 120,
        noRefs: true,
      }),
    );
    setError(undefined);
    setMessage(undefined);
  });

  const parsed = (): Record<string, unknown> | undefined => {
    let obj: unknown;
    try {
      obj = load(value);
    } catch (e) {
      // js-yaml v5 throws on empty/comment-only input (v4 returned undefined),
      // so those land here and are reported as invalid YAML.
      setError(`Invalid YAML: ${(e as Error).message}`);
      return undefined;
    }
    // A scalar or array is a valid YAML document but not a valid workflow
    // definition. Reject non-mappings explicitly so the editor doesn't silently
    // no-op.
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      setError('Workflow definition must be a YAML mapping.');
      return undefined;
    }
    setError(undefined);
    return obj as Record<string, unknown>;
  };

  const validate = async () => {
    const def = parsed();
    if (!def) {
      return;
    }
    setBusy('validate');
    setMessage(undefined);
    try {
      await musterApi.callTool('core_workflow_validate', def, target);
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
      await musterApi.callTool(
        isEdit ? 'core_workflow_update' : 'core_workflow_create',
        def,
        target,
      );
      // muster writes the CR synchronously, so refetching now shows the new
      // or updated workflow instead of waiting for the next 30s poll; the
      // reconciler-trailing availability badge settles on the follow-up read.
      refresh();
      setMessage(
        'Saved. The workflow list has been refreshed; availability may take a few seconds to settle.',
      );
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
      <DialogHeader>
        {isEdit
          ? `Edit ad-hoc workflow — ${workflow?.getName()}`
          : 'Create workflow'}
      </DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-medium">
            {isEdit ? 'Edit' : 'Define'} the muster workflow (name, optional
            description/args, and steps). Validate before saving; both run as
            live mutations against installation <code>{target}</code>.
          </Text>
          <YamlEditorFormField
            label="Workflow definition (YAML)"
            value={value}
            onChange={setValue}
            height={360}
            maxHeight={360}
            error={Boolean(error)}
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

export interface WorkflowMutationActionsProps {
  workflow: MusterWorkflow;
}

/**
 * A GitOps-managed workflow's provenance, in the page: it is read-only and
 * offers its manifest to commit. A manually-added (ad-hoc) one shows nothing
 * here; its Edit and Delete are the page header's (`WorkflowHeaderActions`).
 */
export function WorkflowMutationActions({
  workflow,
}: WorkflowMutationActionsProps) {
  const [manifestOpen, setManifestOpen] = useState(false);

  if (!isGitOpsManaged(workflow)) {
    return null;
  }
  return (
    <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
      <GitOpsManagedLabel />
      <Button
        size="small"
        variant="secondary"
        onPress={() => setManifestOpen(true)}
      >
        Show manifest
      </Button>
      <GitOpsManifestDialog
        workflow={workflow}
        open={manifestOpen}
        onClose={() => setManifestOpen(false)}
      />
    </Flex>
  );
}

/** Which of an ad-hoc workflow's dialogs is open. */
export type WorkflowDialog = 'edit' | 'delete';

/**
 * Edit and Delete for a manually-added (ad-hoc) workflow, in the page header.
 * The header renders outside muster's QueryClientProvider, so the buttons only
 * ask the page to open a dialog; the dialogs, and the live `core_workflow_*`
 * mutations behind them, are the page's (`WorkflowDialogs`).
 */
export function WorkflowHeaderActions({
  onOpen,
}: {
  onOpen: (dialog: WorkflowDialog) => void;
}) {
  return (
    <Flex align="center" gap="2">
      <Button
        variant="secondary"
        iconStart={<Edit fontSize="inherit" />}
        onPress={() => onOpen('edit')}
      >
        Edit
      </Button>
      <Button
        variant="secondary"
        destructive
        iconStart={<DeleteOutline fontSize="inherit" />}
        onPress={() => onOpen('delete')}
      >
        Delete
      </Button>
    </Flex>
  );
}

/** The ad-hoc workflow's edit and delete dialogs, opened from the header. */
export function WorkflowDialogs({
  workflow,
  open,
  onClose,
}: {
  workflow: MusterWorkflow;
  open?: WorkflowDialog;
  onClose: () => void;
}) {
  return (
    <>
      <AdHocWorkflowDialog
        workflow={workflow}
        open={open === 'edit'}
        onClose={onClose}
      />
      <ConfirmDeleteDialog
        workflow={workflow}
        open={open === 'delete'}
        onClose={onClose}
      />
    </>
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
  return (
    <>
      <Tooltip
        title={
          authenticated
            ? 'Create a live ad-hoc workflow'
            : 'Connect to muster (sign in) to create a workflow.'
        }
      >
        {/* span wrapper so the tooltip still fires over the disabled button */}
        <span>
          <Button
            size="small"
            variant="secondary"
            iconStart={<Add fontSize="inherit" />}
            onPress={() => setOpen(true)}
            isDisabled={!authenticated}
          >
            Create workflow
          </Button>
        </span>
      </Tooltip>
      <AdHocWorkflowDialog
        installation={installation}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
