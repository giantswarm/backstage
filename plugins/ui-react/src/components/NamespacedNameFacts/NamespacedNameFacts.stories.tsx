import type { Meta, StoryObj } from '@storybook/react';
import { FactList } from '../FactList';
import { Mono } from '../Mono';
import { namespacedNameFacts } from './namespacedNameFacts';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/NamespacedNameFacts',
  component: FactList,
  tags: ['autodocs'],
  args: { facts: [], maxWidth: null, labelWidth: 160 },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            '`namespacedNameFacts` returns a Kubernetes resource’s namespace ' +
            'and name as two `FactList` facts, Namespace and Name, never one ' +
            '`namespace/name` value.',
          whenToUse:
            'The resource a Technical details card is about. A second resource ' +
            'in the same list passes its `kind`, so its labels read ' +
            '"HelmRelease namespace" and "HelmRelease name".',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof FactList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    facts: [
      ...namespacedNameFacts({ namespace: 'org-acme', name: 'pr-reviewer' }),
      { label: 'Harness', value: <Mono>kagent</Mono> },
    ],
  },
};

export const WithASecondResource: Story = {
  name: 'With a second resource',
  args: {
    facts: [
      ...namespacedNameFacts({ namespace: 'muster', name: 'jira' }),
      ...namespacedNameFacts({
        namespace: 'flux-giantswarm',
        name: 'jira-mcp',
        kind: 'HelmRelease',
      }),
    ],
  },
};
