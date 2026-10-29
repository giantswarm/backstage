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
            'Shared markdown renderer for GS plugins. Renders as core-components’ ' +
            '`MarkdownContent` does, with a GFM default, a typography fix so ' +
            'paragraphs, list items, and plain fenced code blocks render ' +
            'consistently next to surrounding MUI/bui text, and ' +
            '` ```mermaid ` blocks as diagrams.',
          whenToUse:
            'For any user- or catalog-authored markdown — entity README/SOUL, plan ' +
            'documents, PR bodies and comments. Use it instead of calling ' +
            '`MarkdownContent` directly so every surface gets the same fixes.',
          migration: 'core-components',
          extra:
            'Rendering is the react-markdown setup of `@backstage/core-components` ' +
            '`MarkdownContent` (its `CodeSnippet` and `Link`) with a code-block ' +
            'override for Mermaid; the typography normalisation uses MUI v4 ' +
            '`makeStyles`.',
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

export const MermaidDiagrams: Story = {
  args: {
    content: [
      '## Data flow',
      '',
      '```mermaid',
      'graph LR',
      '  Board --> Magazine --> Portal',
      '```',
      '',
      '<details><summary>Sequence</summary>',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  Portal->>Backend: read the document',
      '```',
      '',
      '</details>',
    ].join('\n'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'A ` ```mermaid ` block renders as its diagram wherever it sits in ' +
          'the document — here one inside a `<details>` block.',
      },
    },
  },
};
