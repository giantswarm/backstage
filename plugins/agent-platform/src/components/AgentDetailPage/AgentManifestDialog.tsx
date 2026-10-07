import { useMemo } from 'react';
import {
  Agent,
  toKubectlYaml,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ManifestDialog } from '@giantswarm/backstage-plugin-ui-react';

export type AgentManifestDialogProps = {
  agent: Agent;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * The Agent CR as read-only YAML.
 *
 * A dialog rather than a section on the page: it is the escape hatch for the
 * fields the page does not surface (`deployment`, `sandbox`, `a2aConfig`, labels),
 * needed rarely and long enough to push everything else out of view.
 *
 * Controlled, because the trigger is a `MenuItem` in the page header's kebab —
 * `DialogTrigger` would have to wrap the menu item, and react-aria closes the menu
 * on selection, taking the trigger (and the dialog) with it.
 */
export function AgentManifestDialog({
  agent,
  isOpen,
  onOpenChange,
}: AgentManifestDialogProps) {
  const manifest = useMemo(() => toKubectlYaml(agent), [agent]);

  return (
    <ManifestDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Agent manifest"
      manifest={manifest}
      description={
        <>
          The resource as stored on cluster <strong>{agent.cluster}</strong>,
          minus server-side-apply bookkeeping. Read-only — this view never
          writes.
        </>
      }
    />
  );
}
