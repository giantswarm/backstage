import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardBody, Flex, TextField } from '@backstage/ui';
import { SectionHeader } from './SectionHeader';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
  args: {
    title: 'Identity',
    description: 'How this agent appears across the platform.',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'An `h3` section title with a secondary description below it, sized ' +
            'and spaced to introduce the contents of a card.',
          whenToUse:
            'At the top of a card that groups related form fields or content, so ' +
            'a multi-card page reads as a sequence of named sections. Use it for ' +
            'the *group* name — if the card holds a single control, prefer an ' +
            '`aria-label` on that control over a visible label repeating this title.',
          migration: 'mixed',
          extra:
            'The description is capped at `70ch` for readability, so it wraps ' +
            'independently of the card width.',
        }),
      },
    },
  },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InACard: Story = {
  name: 'In a card',
  render: args => (
    <Card>
      <CardBody>
        <SectionHeader {...args} />
        <Flex direction="column" gap="4">
          <TextField label="Name" placeholder="e.g. Go service reviewer" />
          <TextField label="Slug" placeholder="go-service-reviewer" />
        </Flex>
      </CardBody>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The intended usage: introducing the fields grouped inside a card.',
      },
    },
  },
};

export const LongDescription: Story = {
  name: 'Long description',
  args: {
    title: 'Configuration',
    description:
      'What powers the agent and shapes how it behaves: which model it uses, ' +
      'its system prompt, and its skills. Longer copy wraps at 70 characters ' +
      'per line so it stays readable even in a full-width card.',
  },
  parameters: {
    docs: {
      description: {
        story: 'The description wraps at `70ch` rather than the card width.',
      },
    },
  },
};
