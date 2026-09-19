import type { Meta, StoryObj } from '@storybook/react';
import { GitOpsManagedLabel } from './GitOpsManagedLabel';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/GitOpsManagedLabel',
  component: GitOpsManagedLabel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            '"Managed through GitOps", optionally followed by a link to the ' +
            "resource's definition in Git.",
          whenToUse:
            'Wherever a surface tells the reader that a resource’s desired ' +
            'state lives in Git and is therefore not editable in place — so ' +
            'that every such surface makes the claim in the same words, with ' +
            'the same icon.',
          migration: 'mixed',
          extra:
            'The component holds no GitOps logic. Deciding *whether* a ' +
            'resource is in Git, and finding where, belongs to the caller: ' +
            "flux-react's `GitOpsCard` resolves a Kustomization chain and " +
            'passes the result as `source`, while a caller that reads ' +
            'provenance off plain labels omits `source` entirely and gets the ' +
            'label on its own.\n\nThe `source` slot reserves its width, so a ' +
            'slow lookup resolving into a link does not shift the label.',
        }),
      },
    },
  },
} satisfies Meta<typeof GitOpsManagedLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'No `source`: the claim stands on its own, with no trailing slot.',
      },
    },
  },
};

export const WithSource: Story = {
  args: {
    source: {
      url: 'https://github.com/giantswarm/management-clusters/tree/main/gazelle',
      isLoading: false,
    },
  },
};

export const SourceLoading: Story = {
  args: { source: { isLoading: true } },
  parameters: {
    docs: {
      description: {
        story:
          'The label is the assertion and the link is an extra, so a lookup ' +
          'still in flight never holds back what the caller has already ' +
          'established.',
      },
    },
  },
};

export const SourceFailed: Story = {
  args: {
    source: { isLoading: false, errorMessage: 'GitRepository not found' },
  },
  parameters: {
    docs: {
      description: {
        story:
          'A failed lookup shows an error status in place of the link — the ' +
          'reason is on its tooltip — and leaves the claim intact.',
      },
    },
  },
};
