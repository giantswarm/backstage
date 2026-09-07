import type { Meta, StoryObj } from '@storybook/react';
import { Flex, Text } from '@backstage/ui';
import { ArrowMenuCloseIcon, ArrowMenuOpenIcon } from './MenuArrowIcons';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/MenuArrowIcons',
  component: ArrowMenuCloseIcon,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The Material Symbols pair for folding a side panel away and back: ' +
            '`ArrowMenuCloseIcon` (bar right, arrow left) and ' +
            '`ArrowMenuOpenIcon` (bar left, arrow right).',
          whenToUse:
            'On the control that collapses or expands a left-hand panel. They ' +
            'are hand-vendored because no icon package here ships them — ' +
            '`@material-ui/icons` 4.11.3 is the *classic* Material Icons set, ' +
            'which never had a collapse/expand-panel glyph at all (searching ' +
            'all 1120 of its icons for "collapse", "expand", "sidebar" or ' +
            '"drawer" returns nothing). Their `0 -960 960 960` viewBox is ' +
            "Symbols' own offset grid and has to travel with the paths, or the " +
            'glyph renders off-canvas. Size and colour come from `SvgIcon`, so ' +
            '`fontSize` and `color` behave as on any MUI icon.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof ArrowMenuCloseIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pair: Story = {
  render: () => (
    <Flex align="center" gap="4">
      <Flex direction="column" align="center" gap="1">
        <ArrowMenuCloseIcon />
        <Text variant="body-small">Close</Text>
      </Flex>
      <Flex direction="column" align="center" gap="1">
        <ArrowMenuOpenIcon />
        <Text variant="body-small">Open</Text>
      </Flex>
    </Flex>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Both glyphs are directional and drawn for a panel on the **left**: ' +
          'close points left, toward the edge the panel folds to; open points ' +
          'right, back into the content. A collapsed panel therefore shows ' +
          '*open* — the affordance names what the click will do, not the ' +
          'current state.',
      },
    },
  },
};

export const Sizes: Story = {
  render: () => (
    <Flex align="center" gap="3">
      <ArrowMenuCloseIcon fontSize="small" />
      <ArrowMenuCloseIcon />
      <ArrowMenuCloseIcon fontSize="large" />
    </Flex>
  ),
  parameters: {
    docs: {
      description: {
        story: '`fontSize` scales them like any `SvgIcon`.',
      },
    },
  },
};

export const Colors: Story = {
  render: () => (
    <Flex align="center" gap="3">
      <ArrowMenuCloseIcon />
      <ArrowMenuCloseIcon color="primary" />
      <ArrowMenuCloseIcon color="disabled" />
      <span style={{ color: 'crimson' }}>
        <ArrowMenuCloseIcon />
      </span>
    </Flex>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'No `fill` is baked into the paths, so the glyph inherits ' +
          '`currentColor` — the last one takes its colour from the wrapper.',
      },
    },
  },
};
