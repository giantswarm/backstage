import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties } from 'react';
import { CollapsibleToggle, CollapsibleViewport } from './Collapsible';
import { useCollapsible } from '../../hooks';
import { componentDocs } from '../../storybook/docs';

const longMessage = Array.from(
  { length: 30 },
  (_, i) =>
    `2026-10-16T10:${String(i).padStart(2, '0')}:00Z level=info msg="reconciled" step=${i + 1}`,
).join('\n');

/**
 * A chat bubble cut in place, as the session page draws a long user message:
 * the toggle centred in the bubble, under the fade, on the solid fill.
 */
function Bubble({
  text,
  collapsedHeight,
}: {
  text: string;
  collapsedHeight: number | string;
}) {
  const collapsible = useCollapsible({ collapsedHeight });
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
    >
      <div
        style={
          {
            maxWidth: '85%',
            padding: '10px 16px',
            borderRadius: 'var(--bui-radius-3)',
            // The session page's bubble: the fill Send carries. Deprecated
            // for `--bui-accent-*`, but still what bui's primary Button paints.
            // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
            background: 'var(--bui-bg-solid)',
            // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
            color: 'var(--bui-fg-solid)',
            // On the bubble, so the cut's `lh` is a line of its text.
            fontSize: '0.875rem',
            lineHeight: 1.6,
            // The fade fades to the bubble's fill, not the page's.
            // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
            '--bui-bg-inherit': 'var(--bui-bg-solid)',
          } as CSSProperties
        }
      >
        <CollapsibleViewport state={collapsible}>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              font: 'inherit',
            }}
          >
            {text}
          </pre>
        </CollapsibleViewport>
        {collapsible.overflows && (
          <div
            style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}
          >
            <CollapsibleToggle
              state={collapsible}
              labels={{ expand: 'Show more', collapse: 'Show less' }}
              onSolid
            />
          </div>
        )}
      </div>
    </div>
  );
}

const meta = {
  title: 'Components/Collapsible',
  component: Bubble,
  tags: ['autodocs'],
  args: {
    text: longMessage,
    collapsedHeight: '10lh',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The pieces of a region cut to a fixed height behind a fade: ' +
            '`useCollapsible` holds the state, `CollapsibleViewport` cuts the ' +
            'content and `CollapsibleToggle` shows or cuts it again. The ' +
            'height is pixels or any CSS length (`10lh`: ten lines of the text). ' +
            'Content that fits, or would hide no more than a fifth of the cut, ' +
            'is shown whole and gets no toggle. Focus or find in page past the ' +
            'cut shows everything; cutting again brings the content back into ' +
            'view.',
          whenToUse:
            'When the content is cut inside a box of its own and the toggle ' +
            'goes in that box too — a chat bubble, where the session page ' +
            'centres *Show more* under the fade of a long user message. ' +
            '`onSolid` draws the toggle in the foreground of a filled surface. ' +
            'For markdown, ' +
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
