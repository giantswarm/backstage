import type { Meta, StoryObj } from '@storybook/react';
import { Badge, Flex } from '@backstage/ui';
import { FactList } from './FactList';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/FactList',
  component: FactList,
  tags: ['autodocs'],
  args: {
    facts: [
      { label: 'Node image', value: 'AL2023 · al2023@latest' },
      { label: 'Root volume', value: '15Gi, gp3' },
      { label: 'Max pods per node', value: '110' },
      { label: 'Detailed monitoring', value: 'Off' },
      { label: 'IAM role', value: 'operations-worker' },
    ],
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A compact list of label/value pairs laid out as horizontal rows ' +
            'separated by hairline rules, rendered as a definition list ' +
            '(`dl`/`dt`/`dd`).',
          whenToUse:
            'For a detail block of many short facts, where a horizontal ' +
            '`label | value` row is denser and easier to scan than a stack. ' +
            'Prefer `ContentRow` where a label stacked *above* its value suits ' +
            'the surrounding layout better. Below 520px the rows stack ' +
            'automatically.',
          migration: 'mixed',
          extra:
            'The label column is capped with `minmax()` rather than sized ' +
            'proportionally — a percentage track pushes values far from their ' +
            'labels in a wide container, which is what stops a list reading as ' +
            'pairs. `maxWidth` holds a readable measure for the same reason; ' +
            'pass `null` to fill the container instead.\n\n' +
            'The rules run unbroken across both columns (the gutter is padding ' +
            'on the label cell, not a grid gap) and are omitted on the last ' +
            'row, so a list closes cleanly against its container.',
        }),
      },
    },
  },
} satisfies Meta<typeof FactList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithRichValues: Story = {
  args: {
    facts: [
      { label: 'Capacity type', value: 'Spot, On-demand' },
      {
        label: 'Instance families',
        value: (
          <Flex gap="1" align="center" style={{ flexWrap: 'wrap' }}>
            <Badge size="small">c7g</Badge>
            <Badge size="small">m7g</Badge>
            <Badge size="small">r7g</Badge>
          </Flex>
        ),
      },
      { label: 'Expire after', value: '30d' },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'A value may be any node, not just a string. Rows align on the ' +
          'baseline, so a label stays level with the first line of a chip row.',
      },
    },
  },
};

export const NarrowLabelColumn: Story = {
  args: {
    labelWidth: 110,
    facts: [
      { label: 'CPU', value: '16 / 1000' },
      { label: 'Memory', value: '38 GiB / 1000 GiB' },
      { label: 'Nodes', value: '4' },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: '`labelWidth` caps the label column for short labels.',
      },
    },
  },
};

export const FullWidth: Story = {
  args: {
    maxWidth: null,
    facts: [
      {
        label: 'Taints',
        value:
          'node.cluster.x-k8s.io/uninitialized=true:NoSchedule, ' +
          'node.cilium.io/agent-not-ready=true:NoSchedule',
      },
      { label: 'IAM role', value: 'operations-worker' },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          '`maxWidth={null}` lets the list fill its container, for values too ' +
          'long to sit inside the default measure.',
      },
    },
  },
};
