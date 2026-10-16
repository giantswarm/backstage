import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties } from 'react';
import {
  CollapsibleToggle,
  CollapsibleViewport,
  useCollapsible,
} from './Collapsible';
import { componentDocs } from '../../storybook/docs';

const longMessage = Array.from(
  { length: 30 },
  (_, i) =>
    `2026-10-16T10:${String(i).padStart(2, '0')}:00Z level=info msg="reconciled" step=${i + 1}`,
).join('\n');

/** A chat bubble cut in place, with its toggle under the bubble. */
function Bubble({
  text,
  collapsedHeight,
}: {
  text: string;
  collapsedHeight: number;
}) {
  const collapsible = useCollapsible({ collapsedHeight });
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
      }}
    >
      <div
        style={
          {
            maxWidth: '85%',
            padding: '10px 16px',
            borderRadius: 'var(--bui-radius-3)',
            background: '#1f5c9e',
            color: '#fff',
            // The fade fades to the bubble's fill, not the page's.
            '--bui-bg-inherit': '#1f5c9e',
          } as CSSProperties
        }
      >
        <CollapsibleViewport state={collapsible}>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              lineHeight: 1.6,
            }}
          >
            {text}
          </pre>
        </CollapsibleViewport>
      </div>
      <CollapsibleToggle
        state={collapsible}
        labels={{ expand: 'Show more', collapse: 'Show less' }}
      />
    </div>
  );
}

const meta = {
  title: 'Components/Collapsible',
  component: Bubble,
  tags: ['autodocs'],
  args: {
    text: longMessage,
    collapsedHeight: 224,
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The pieces of a region cut to a fixed height behind a fade: ' +
            '`useCollapsible` holds the state, `CollapsibleViewport` cuts the ' +
            'content and `CollapsibleToggle` shows or cuts it again. Content ' +
            'that fits is shown whole and gets no toggle.',
          whenToUse:
            'When the toggle cannot sit right under the content in the same ' +
            'box — under a chat bubble, say, where the session page puts ' +
            '*Show more* for a long user message. For markdown, ' +
            '`CollapsibleMarkdown` composes them already. A surface bui does ' +
            'not paint sets `--bui-bg-inherit` to its fill, so the fade matches it.',
          migration: 'mixed',
          extra:
            'The toggle is a bui `Button`; the height cap and the fade use MUI ' +
            'v4 `makeStyles`.',
        }),
      },
    },
  },
} satisfies Meta<typeof Bubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnderABubble: Story = {};

export const Fits: Story = {
  args: { text: 'A short message that fits, so there is no toggle.' },
};
