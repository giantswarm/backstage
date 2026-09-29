import type { Meta, StoryObj } from '@storybook/react';
import { CollapsibleMarkdown } from './CollapsibleMarkdown';
import { componentDocs } from '../../storybook/docs';

const longSample = [
  '# Shop-floor assistant',
  '',
  'You answer questions about **machines, production and downtime**.',
  '',
  '## How you work',
  '',
  '- Look before you answer: every figure comes from the records.',
  '- Split OEE before you interpret it.',
  '- Look for the losses that hide.',
  '- Check the number is comparable before comparing it.',
  '',
  '## How you write',
  '',
  'Plain shop-floor English. Name the machine, name the loss, give the number,',
  'say what to do.',
  '',
  '## Out of scope',
  '',
  '- Maintenance scheduling and work orders.',
  '- Production scheduling and order sequencing.',
  '- Safety incidents.',
].join('\n');

const meta = {
  title: 'Components/CollapsibleMarkdown',
  component: CollapsibleMarkdown,
  tags: ['autodocs'],
  args: {
    content: longSample,
    toggleLabels: { expand: 'Show full prompt', collapse: 'Show less' },
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Markdown cut to a fixed height (250px by default) behind a fade, ' +
            'with a toggle to show all of it. Content that fits is shown whole ' +
            'and gets no toggle.',
          whenToUse:
            'For a markdown document shown inside a page next to other ' +
            'content — a README, a SOUL.md, an agent’s system prompt — where the ' +
            'whole text would push everything else out of view. ' +
            '`CollapsibleMarkdownCard` wraps it in a card with loading, error ' +
            'and empty states.',
          migration: 'mixed',
          extra:
            'The toggle is a bui `Button`; rendering is `GSMarkdownContent` ' +
            '(core-components `MarkdownContent`); the height cap and the fade ' +
            'use MUI v4 `makeStyles`.',
        }),
      },
    },
  },
} satisfies Meta<typeof CollapsibleMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Short: Story = {
  args: {
    content: 'A short prompt that fits, so there is **no toggle**.',
  },
  parameters: {
    docs: {
      description: {
        story: 'Content shorter than the collapsed height renders whole.',
      },
    },
  },
};

export const CustomHeight: Story = {
  args: {
    collapsedHeight: 120,
  },
  parameters: {
    docs: {
      description: {
        story: 'Pass `collapsedHeight` to cut the preview elsewhere.',
      },
    },
  },
};
