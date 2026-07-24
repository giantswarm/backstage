import type { Meta, StoryObj } from '@storybook/react';
import { GSMarkdownContent } from './GSMarkdownContent';
import { componentDocs } from '../../storybook/docs';

const sample = [
  '# Cluster onboarding',
  '',
  'This cluster runs on **AWS** in `eu-central-1`.',
  '',
  '## Next steps',
  '',
  '- Install the ingress controller',
  '- Configure DNS',
  '- Add the monitoring stack',
  '',
  'See the [docs](https://docs.giantswarm.io) for details.',
  '',
  '```',
  'kubectl get nodes',
  '```',
].join('\n');

const meta = {
  title: 'Components/GSMarkdownContent',
  component: GSMarkdownContent,
  tags: ['autodocs'],
  args: {
    content: sample,
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Shared markdown renderer for GS plugins. Wraps core-components’ ' +
            '`MarkdownContent` with a GFM default and a typography fix so ' +
            'paragraphs, list items, and plain fenced code blocks render ' +
            'consistently next to surrounding MUI/bui text.',
          whenToUse:
            'For any user- or catalog-authored markdown — entity README/SOUL, plan ' +
            'documents, PR bodies and comments. Use it instead of calling ' +
            '`MarkdownContent` directly so every surface gets the same fixes.',
          migration: 'core-components',
          extra:
            'Rendering is `@backstage/core-components` `MarkdownContent`; the ' +
            'typography normalisation uses MUI v4 `makeStyles`.',
        }),
      },
    },
  },
} satisfies Meta<typeof GSMarkdownContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CommonMark: Story = {
  args: {
    dialect: 'common-mark',
    content: 'Plain CommonMark: no ~~strikethrough~~ or task lists here.',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Pass `dialect="common-mark"` to opt out of GitHub-flavoured extensions.',
      },
    },
  },
};
