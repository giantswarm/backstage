import { useMemo, useState } from 'react';
import { toKubectlYaml } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ManifestDialog } from '@giantswarm/backstage-plugin-ui-react';
import { MusterWorkflow } from '../../../lib/k8s';

export type WorkflowManifestDialogProps = {
  workflow: MusterWorkflow;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * The Workflow CR as read-only YAML, with a copy button: the page menu's
 * "View manifest". Controlled, because its trigger is a menu item, as with
 * the agent page's manifest.
 *
 * The YAML is serialized only once the dialog has been opened, since most
 * visits never open it; from then on it follows the workflow's refetches and
 * stays while the dialog fades out.
 */
export function WorkflowManifestDialog({
  workflow,
  isOpen,
  onOpenChange,
}: WorkflowManifestDialogProps) {
  const [opened, setOpened] = useState(isOpen);
  // Adjusted while rendering, React's pattern for state that follows a prop.
  if (isOpen && !opened) {
    setOpened(true);
  }
  const manifest = useMemo(
    () => (opened ? toKubectlYaml(workflow) : undefined),
    [opened, workflow],
  );

  return (
    <ManifestDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Workflow manifest"
      manifest={manifest}
      description={
        workflow.cluster ? (
          <>
            As stored on cluster <strong>{workflow.cluster}</strong>, minus
            server-side-apply bookkeeping.
          </>
        ) : (
          'As stored on the cluster, minus server-side-apply bookkeeping.'
        )
      }
    />
  );
}
