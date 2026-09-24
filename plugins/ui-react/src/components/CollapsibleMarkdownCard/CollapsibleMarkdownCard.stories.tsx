import type { Meta, StoryObj } from '@storybook/react';
import { CollapsibleMarkdownCard } from './CollapsibleMarkdownCard';
import { componentDocs } from '../../storybook/docs';

const readme = [
  '# example-app',
  '',
  'An example application chart.',
  '',
  '## Installing',
  '',
  'Deploy it from the **Deploy application** card, or add a `HelmRelease`',
  'pointing at this chart to your GitOps repository.',
  '',
  '## Configuration',
  '',
  '| Value | Default | Description |',
  '| --- | --- | --- |',
  '| `replicas` | `2` | Number of pods |',
  '| `image.tag` | chart version | Image tag to run |',
  '| `ingress.enabled` | `false` | Expose the app through an ingress |',
  '',
  '## Upgrading',
  '',
  'Read the changelog before a major version: values may be renamed.',
].join('\n');

const meta = {
  title: 'Components/CollapsibleMarkdownCard',
  component: CollapsibleMarkdownCard,
  tags: ['autodocs'],
  args: {
    title: 'README',
    content: readme,
    isLoading: false,
    emptyMessage: 'No README available.',
    toggleLabels: { expand: 'Show full README', collapse: 'Show less' },
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A card showing a loaded markdown document through ' +
            '`CollapsibleMarkdown`, with loading, error and empty states.',
          whenToUse:
            'For a document fetched at runtime (a chart README, a SOUL.md) ' +
            'shown on an entity or resource page. For markdown already at hand ' +
            'inside a card of your own, use `CollapsibleMarkdown` directly.',
          migration: 'mixed',
          extra:
            'Card, text and toggle are bui; loading is core-components ' +
            '`Progress`, the title icon is `@material-ui/icons`.',
        }),
      },
    },
  },
} satisfies Meta<typeof CollapsibleMarkdownCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: { content: undefined, isLoading: true },
};

export const Empty: Story = {
  args: { content: undefined },
};

export const Failed: Story = {
  args: {
    content: undefined,
    error: new Error('Could not fetch the README.'),
  },
};
