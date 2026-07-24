import type { Meta, StoryObj } from '@storybook/react';
import { DateComponent } from './DateComponent';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/DateComponent',
  component: DateComponent,
  tags: ['autodocs'],
  args: {
    value: '2026-01-15T09:30:00Z',
  },
  argTypes: {
    value: { control: 'text' },
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Formats a date/ISO string consistently across the app. Optionally ' +
            'renders it as a live-updating relative time (“3 minutes ago”) with the ' +
            'absolute date in a tooltip; the relative label refreshes itself once a ' +
            'minute for recent times.',
          whenToUse:
            'For any timestamp shown to a user (creation times, last-seen, event ' +
            'times) so formatting and relative-time behaviour are uniform. Renders ' +
            'nothing when `value` is empty, so it’s safe to pass a possibly-missing ' +
            'date.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof DateComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Absolute: Story = {
  parameters: {
    docs: {
      description: { story: 'Default: an absolute, formatted date/time.' },
    },
  },
};

export const Relative: Story = {
  args: {
    value: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    relative: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'With `relative`, shows a relative label (e.g. “3 minutes ago”) and the ' +
          'full date on hover.',
      },
    },
  },
};

export const Empty: Story = {
  args: { value: null },
  parameters: {
    docs: {
      description: {
        story: 'A `null`/empty value renders nothing (no placeholder).',
      },
    },
  },
};
