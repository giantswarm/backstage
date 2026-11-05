import type { Meta, StoryObj } from '@storybook/react';
import { MermaidDiagram } from './MermaidDiagram';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/MermaidDiagram',
  component: MermaidDiagram,
  tags: ['autodocs'],
  args: {
    source: [
      'graph LR',
      '  Board[Project board] --> Magazine',
      '  Magazine --> Portal[Dev Portal]',
      '  Knowledge[Knowledge documents] --> Portal',
    ].join('\n'),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'One Mermaid diagram rendered as SVG in the theme’s light or dark ' +
            'palette. Mermaid loads lazily, in its own chunk; while it loads, ' +
            'the source shows. A diagram that cannot be rendered shows its ' +
            'source under a warning note naming the error.',
          whenToUse:
            'A diagram outside markdown. In markdown, `GSMarkdownContent` ' +
            'already renders every top-level ```` ```mermaid ```` block with it.',
          migration: 'mixed',
          extra:
            'The error note is a bui `Alert`; the layout uses MUI v4 ' +
            '`makeStyles` and reads the MUI theme’s palette type.',
        }),
      },
    },
  },
} satisfies Meta<typeof MermaidDiagram>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sequence: Story = {
  args: {
    source: [
      'sequenceDiagram',
      '  Portal->>Backend: read the document',
      '  Backend-->>Portal: markdown',
    ].join('\n'),
  },
};

export const InvalidDiagram: Story = {
  args: { source: 'graph TD\n  A -->' },
  parameters: {
    docs: {
      description: {
        story:
          'An invalid diagram shows its source under a note with Mermaid’s error.',
      },
    },
  },
};
