import type { Meta, StoryObj } from '@storybook/react';
import { Box, Flex, Text } from '@backstage/ui';
import { SimpleAccordion } from './SimpleAccordion';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/SimpleAccordion',
  component: SimpleAccordion,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A single collapsible section — a header that reveals its content ' +
            'when triggered.',
          whenToUse:
            'Any time content should start hidden: a "how to" aside, a raw-data ' +
            'dump, one entry in a list of details. Prefer it over composing ' +
            "bui's `Accordion`/`AccordionTrigger`/`AccordionPanel` yourself — a " +
            'hand-composed accordion has no bottom padding on an expanded ' +
            'header, so the header sits flush against its content, and the CSS ' +
            'selector that fixes it is easy to get wrong in a way that fails ' +
            'silently. For an exclusive set (only one open at a time) or ' +
            "controlled expansion, use bui's primitives with " +
            '`useSimpleAccordionStyles` to keep the spacing.',
          migration: 'mixed',
          extra:
            'Each instance is its own `AccordionGroup`, so sections expand ' +
            'independently. `defaultExpanded` is read on mount only — give the ' +
            'element a React `key` that changes with its content to re-seed it.',
        }),
      },
    },
  },
  decorators: [
    Story => (
      <Box style={{ maxWidth: 560 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof SimpleAccordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'How to set up tsh',
    children: (
      <Text>
        Install the Teleport client, then log in with your Giant Swarm account.
      </Text>
    ),
  },
};

export const Expanded: Story = {
  name: 'Open by default',
  args: {
    title: 'Raw data',
    children: <Text>Everything the API returned for this workload.</Text>,
  },
  render: args => <SimpleAccordion {...args} defaultExpanded />,
};

export const NodeTitle: Story = {
  name: 'Header carrying more than a label',
  args: {
    title: (
      <Box grow>
        <Flex align="center" justify="between" gap="2">
          <Text>Ready</Text>
          <Text variant="body-small" color="secondary">
            9 days ago
          </Text>
        </Flex>
      </Box>
    ),
    children: <Text>Deployment is not ready, 0/1 pods are ready.</Text>,
  },
};

export const Stacked: Story = {
  name: 'Several, expanding independently',
  args: { title: 'Accepted', children: null },
  render: () => (
    <Flex direction="column" gap="1">
      <SimpleAccordion title="Accepted">
        <Text>Agent configuration accepted.</Text>
      </SimpleAccordion>
      <SimpleAccordion title="Ready" defaultExpanded>
        <Text>Deployment is ready.</Text>
      </SimpleAccordion>
      <SimpleAccordion title="UnsupportedFeatures">
        <Text>memory is not supported by the go runtime.</Text>
      </SimpleAccordion>
    </Flex>
  ),
};
