import { useState } from 'react';
import { dump, load } from 'js-yaml';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import Edit from '@material-ui/icons/Edit';
import DeleteOutline from '@material-ui/icons/DeleteOutline';
import Add from '@material-ui/icons/Add';
// MUI's Tooltip, not bui's: a disabled bui Button fires neither hover nor
// focus, so a react-aria tooltip could not explain why it is disabled.
import Tooltip from '@material-ui/core/Tooltip';
import { useApi } from '@backstage/core-plugin-api';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  ConfirmDialog,
  GitOpsManagedLabel,
  ManifestDialog,
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
import { DefinitionEditorDialog } from '../shared';

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

  return (
    <ManifestDialog
      isOpen={open}
      onOpenChange={next => {
        if (!next) {
          onClose();
        }
      }}
      title={<>Workflow manifest — {workflow.getName()}</>}
      manifest={manifest}
      label="Current manifest"
      description={
        <>
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
        </>
      }
    />
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
  const mutation = useTrackedMutation({
    event: null,
    untrackedReason: 'Workflows are not a tracked portal action yet.',
    mutationFn: () =>
      musterApi.callTool(
        'core_workflow_delete',
        { name: workflow.getName() },
        workflow.cluster,
      ),
    // muster deletes the CR synchronously, so refetching now removes the
    // row instead of waiting for the next 30s poll. The workflow list is
    // fed entirely by the provider's CRD reads (no runtime aggregator query
    // like the servers page), so the provider retry covers everything.
    onSuccess: () => refresh(),
  });

  // Reset on open, not on close: the dialog keeps rendering while it fades out.
  useOnDialogOpen(open, () => mutation.reset());

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
      isBusy={mutation.isPending}
      error={mutation.error ? mutationErrorMessage(mutation.error) : undefined}
      isDone={mutation.isSuccess}
      onConfirm={() => mutation.mutate()}
    >
      <Text as="p" variant="body-medium">
        This permanently removes the ad-hoc workflow{' '}
        <code>{workflow.getName()}</code> from this muster instance. This is a
        live mutation and cannot be undone.
      </Text>
      {mutation.isSuccess && (
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
 * Ad-hoc workflow dialog: a YAML editor validated via `core_workflow_validate`
 * and saved via `core_workflow_create` (when `workflow` is absent) or
 * `core_workflow_update` (editing an existing ad-hoc workflow).
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
  return (
    <DefinitionEditorDialog
      open={open}
      onClose={onClose}
      installation={workflow?.cluster ?? installation}
      title={
        workflow
          ? `Edit ad-hoc workflow — ${workflow.getName()}`
          : 'Create workflow'
      }
      description={`${
        workflow ? 'Edit' : 'Define'
      } the muster workflow (name, optional description/args, and steps).`}
      seed={() =>
        dump(
          workflow ? toWorkflowDefinition(workflow) : NEW_WORKFLOW_TEMPLATE,
          {
            lineWidth: 120,
            noRefs: true,
          },
        )
      }
      parse={parseYamlDefinition}
      renderEditor={({ value, onChange, invalid }) => (
        <YamlEditorFormField
          label="Workflow definition (YAML)"
          value={value}
          onChange={onChange}
          height={360}
          maxHeight={360}
          error={invalid}
        />
      )}
      validateTool="core_workflow_validate"
      saveTool={workflow ? 'core_workflow_update' : 'core_workflow_create'}
      saveUntrackedReason="Workflows are not a tracked portal action yet."
      // The reconciler-trailing availability badge settles on the follow-up read.
      savedMessage="Saved. The workflow list has been refreshed; availability may take a few seconds to settle."
    />
  );
}

function parseYamlDefinition(value: string): Record<string, unknown> {
  let obj: unknown;
  try {
    obj = load(value);
  } catch (e) {
    // js-yaml v5 throws on empty/comment-only input (v4 returned undefined),
    // so those land here and are reported as invalid YAML.
    throw new Error(`Invalid YAML: ${(e as Error).message}`);
  }
  // A scalar or array is a valid YAML document but not a valid workflow
  // definition. Reject non-mappings explicitly so the editor doesn't silently
  // no-op.
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Workflow definition must be a YAML mapping.');
  }
  return obj as Record<string, unknown>;
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
