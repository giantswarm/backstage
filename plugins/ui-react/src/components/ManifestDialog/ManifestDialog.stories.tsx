import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button, Flex } from '@backstage/ui';
import { ManifestDialog, type ManifestDialogProps } from './ManifestDialog';
import { componentDocs } from '../../storybook/docs';

const manifest = [
  'apiVersion: kustomize.toolkit.fluxcd.io/v1',
  'kind: Kustomization',
  'metadata:',
  '  name: my-app',
  '  namespace: flux-system',
  'spec:',
  '  interval: 10m',
  '  path: ./apps/my-app',
  '  prune: true',
  '  sourceRef:',
  '    kind: GitRepository',
  '    name: flux-system',
  'status:',
  '  conditions:',
  '    - type: Ready',
  "      status: 'True'",
  '      reason: ReconciliationSucceeded',
  "      message: 'Applied revision: main@sha1:0123456789abcdef'",
  '',
].join('\n');

const meta = {
  title: 'Components/ManifestDialog',
  component: ManifestDialog,
  tags: ['autodocs'],
  args: {
    isOpen: true,
    onOpenChange: () => {},
    title: 'Kustomization flux-system/my-app',
    description:
      'The resource as stored on cluster gazelle, without server-side-apply bookkeeping. Read-only.',
    manifest,
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A modal that shows a resource manifest as syntax-highlighted, ' +
            'read-only YAML (the read-only `YamlEditorFormField`), with a ' +
            '"Copy manifest" button.',
          whenToUse:
            'Whenever a page offers to show the raw manifest of a resource. ' +
            'Serialize a Kubernetes object with `toManifestYaml` from ' +
            '`@giantswarm/backstage-plugin-kubernetes-react` first, so it ' +
            'reads like `kubectl get -o yaml`.',
          migration: 'mixed',
          extra:
            'Controlled via `isOpen`/`onOpenChange` rather than wrapped in a ' +
            '`DialogTrigger`, so the trigger can be anything, a `MenuItem` ' +
            'included.',
        }),
      },
    },
  },
} satisfies Meta<typeof ManifestDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Owns the open state, since hooks belong in a component, not a bare `render`.
const ManifestDialogExample = (args: ManifestDialogProps) => {
  const [isOpen, setOpen] = useState(false);

  return (
    <Flex direction="column" gap="3" style={{ alignItems: 'flex-start' }}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View YAML
      </Button>
      <ManifestDialog {...args} isOpen={isOpen} onOpenChange={setOpen} />
    </Flex>
  );
};

/** Open the dialog from a button and close it again. */
export const Interactive: Story = {
  render: args => <ManifestDialogExample {...args} />,
};

/** The dialog open, as it renders on a page. */
export const Open: Story = {};
