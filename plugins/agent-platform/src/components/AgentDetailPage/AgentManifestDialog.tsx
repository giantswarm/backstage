import { Dialog, DialogBody, DialogHeader, Text } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import { CodeBlock } from '../CodeBlock';
import { toAgentManifestYaml } from './helpers';

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
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="min(90vw, 860px)"
    >
      <DialogHeader>Agent manifest</DialogHeader>
      <DialogBody>
        <Text variant="body-small" color="secondary">
          The resource as stored, minus server-side-apply bookkeeping. Read-only
          — this view never writes.
        </Text>
        <CodeBlock
          content={toAgentManifestYaml(agent)}
          filename={`${agent.getName()}.yaml`}
          path={`${agent.cluster} · ${agent.getNamespace() ?? ''}`}
          language="yaml"
        />
      </DialogBody>
    </Dialog>
  );
}
