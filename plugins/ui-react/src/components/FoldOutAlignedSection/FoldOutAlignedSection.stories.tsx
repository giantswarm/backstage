import type { Meta, StoryObj } from '@storybook/react';
import { Box, Flex } from '@backstage/ui';
import { FactList } from '../FactList';
import { TechnicalDetailsFoldOut } from '../TechnicalDetailsFoldOut';
import { FoldOutAlignedSection } from './FoldOutAlignedSection';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/FoldOutAlignedSection',
  component: FoldOutAlignedSection,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A region above a "Technical details" fold-out, inset as the ' +
            "fold-out insets its title, so the region's content lines up with it.",
          whenToUse:
            "A detail page's plain facts in this section, directly above " +
            'the `TechnicalDetailsFoldOut`: the connector and workflow ' +
            "pages' Details tabs and the model page's Overview.",
          migration: 'mixed',
        }),
      },
    },
  },
  decorators: [
    Story => (
      <Box style={{ maxWidth: 720 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof FoldOutAlignedSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AboveTheFoldOut: Story = {
  name: 'Above the fold-out',
  args: {
    'aria-label': 'Model details',
    children: (
      <FactList
        facts={[
          { label: 'Provider', value: 'Anthropic' },
          { label: 'Model ID', value: 'claude-sonnet-4-5' },
          { label: 'Endpoint', value: 'Provider default' },
        ]}
        labelWidth={160}
      />
    ),
  },
  render: args => (
    <Flex direction="column" gap="5">
      <FoldOutAlignedSection {...args} />
      <TechnicalDetailsFoldOut defaultExpanded={false}>
        <span />
      </TechnicalDetailsFoldOut>
    </Flex>
  ),
};
