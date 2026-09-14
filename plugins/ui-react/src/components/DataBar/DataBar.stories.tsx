import type { Meta, StoryObj } from '@storybook/react';
import { DataBar } from './DataBar';
import type { DataBarProps } from './DataBar';
import { categoricalColors } from '../../utils/chartPalette';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/DataBar',
  component: DataBar,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div style={{ width: 160 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A number with a proportional bar beneath it, for a table column ' +
            'whose rows are worth comparing at a glance. The number is always ' +
            'the value; the bar is `aria-hidden` and only a comparison aid.',
          whenToUse:
            '- A numeric table column where the *relative* size of rows is part ' +
            'of the story (spend per agent, tokens per model).\n' +
            '- Scale each column to its own maximum, and give each column its ' +
            'own hue from `categoricalColors` — bars are comparable **down** a ' +
            'column, not across columns, and a shared colour would invite the ' +
            'comparison the scaling does not support.\n' +
            '- Not for a column read one row at a time; the bar is then ink ' +
            'without a job.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof DataBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Stand-in for a theme lookup; stories render outside a themed table. */
const BLUE = '#2a78d6';

export const Default: Story = {
  args: { label: '7.5M', value: 7_500_000, max: 7_500_000, color: BLUE },
};

export const Partial: Story = {
  args: { label: '300k', value: 300_000, max: 7_500_000, color: BLUE },
};

/** Zero draws no fill at all — zero and "very small" must look different. */
export const Zero: Story = {
  args: { label: '0', value: 0, max: 7_500_000, color: BLUE },
};

/** No value: the track alone, because there is nothing to compare. */
export const Unknown: Story = {
  args: { label: '—', value: undefined, max: 7_500_000, color: BLUE },
};

/** A value over the max is clamped rather than overflowing its track. */
export const Clamped: Story = {
  args: { label: '9.9M', value: 9_900_000, max: 7_500_000, color: BLUE },
};

/**
 * A column per measure, each on its own hue and its own scale — the shape the
 * Agent Platform's cost tables use.
 */
export const OneHuePerColumn = {
  render: () => {
    const palette = categoricalColors({
      palette: { type: 'light' },
    } as Parameters<typeof categoricalColors>[0]);
    const columns: { label: string; rows: [string, number][]; max: number }[] =
      [
        {
          label: 'Model calls',
          rows: [
            ['120', 120],
            ['400', 400],
            ['3', 3],
          ],
          max: 400,
        },
        {
          label: 'Tokens',
          rows: [
            ['7.5M', 7_500_000],
            ['300k', 300_000],
            ['60k', 60_000],
          ],
          max: 7_500_000,
        },
        {
          label: 'Cost',
          rows: [
            ['$42.50', 42.5],
            ['$6.50', 6.5],
            ['$1.00', 1],
          ],
          max: 42.5,
        },
      ];

    return (
      <div style={{ display: 'flex', gap: 24, width: 520 }}>
        {columns.map((column, index) => (
          <div key={column.label} style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              {column.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {column.rows.map(([label, value]) => (
                <DataBar
                  key={label}
                  label={label}
                  value={value}
                  max={column.max}
                  color={palette[index]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  },
} satisfies StoryObj<DataBarProps>;
