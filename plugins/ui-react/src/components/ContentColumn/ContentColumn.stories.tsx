import type { Meta, StoryObj } from '@storybook/react';
import { Box, Text } from '@backstage/ui';
import { ContentColumn, SHELL_CONTENT_MAX_WIDTH } from './ContentColumn';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ContentColumn',
  component: ContentColumn,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: componentDocs({
          summary: `A centred content column, at most ${SHELL_CONTENT_MAX_WIDTH}px wide (\`SHELL_CONTENT_MAX_WIDTH\`).`,
          whenToUse:
            'Around each view of a screen that sits inside the shell without ' +
            "`ShellPage`, such as the Usage views, so it keeps the shell's " +
            'content width. Put a tab strip above the views in the same ' +
            'column so the strip and the content stay aligned. Below the ' +
            'maximum width it fills the available width.',
          migration: 'none',
        }),
      },
    },
  },
} satisfies Meta<typeof ContentColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <Box
        p="4"
        style={{
          border: '1px dashed var(--bui-border-1)',
          borderRadius: 4,
        }}
      >
        <Text>
          The content stops at {SHELL_CONTENT_MAX_WIDTH}px and centres in a
          wider view.
        </Text>
      </Box>
    ),
  },
};
