import type { Meta, StoryObj } from '@storybook/react';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import { Flex } from '@backstage/ui';
import { StatusLabel } from './StatusLabel';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/StatusLabel',
  component: StatusLabel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'An icon plus a label describing the state of something — a ' +
            "workload's readiness, a run's outcome, a resource's health. The " +
            'icon carries the colour (from a bui `--bui-fg-*` token) and the ' +
            'label stays full-contrast text.',
          whenToUse:
            'Any time a status needs a name and a colour. Prefer this over ' +
            "`@backstage/core-components`' `Status*`, which puts `aria-hidden` " +
            'on a span wrapping both its icon and its children — so a label ' +
            'passed as its child is hidden from screen readers and the status ' +
            'reads as empty. Presentation only: wrap it in a table `Cell`, a ' +
            'metadata row, or a card as needed.',
          migration: 'none',
        }),
      },
    },
  },
} satisfies Meta<typeof StatusLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Ready', intent: 'positive' },
};

export const AllIntents: Story = {
  args: { label: 'Ready', intent: 'positive' },
  render: () => (
    <Flex direction="column" gap="2">
      <StatusLabel label="Ready" intent="positive" />
      <StatusLabel label="Not ready" intent="warning" />
      <StatusLabel label="Not accepted" intent="negative" />
      <StatusLabel label="Informational" intent="info" />
      <StatusLabel label="Unknown" intent="neutral" />
    </Flex>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every intent has a distinct silhouette as well as a distinct ' +
          'colour, so the state survives greyscale and colour blindness.',
      },
    },
  },
};

export const WithDetail: Story = {
  args: {
    label: 'Not ready',
    intent: 'warning',
    title: 'Deployment is not ready, 0/1 pods are ready',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Hover to see the underlying reason. Useful for surfacing a ' +
          "controller's own message without spending a column on it.",
      },
    },
  },
};

export const CustomIcon: Story = {
  args: {
    label: 'Pending',
    intent: 'neutral',
    icon: HourglassEmptyIcon,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Override the intent's default glyph when a domain has a more " +
          'specific one — here an hourglass for "waiting", which reads better ' +
          'than the neutral default circle.',
      },
    },
  },
};
