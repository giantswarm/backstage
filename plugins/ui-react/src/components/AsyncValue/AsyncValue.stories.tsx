import type { Meta, StoryObj } from '@storybook/react';
import { AsyncValue } from './AsyncValue';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/AsyncValue',
  component: AsyncValue,
  tags: ['autodocs'],
  // Default args cover the required props; each story overrides via `render`.
  args: { value: 'v1.29.4', isLoading: false },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Renders the three states of an asynchronously-loaded value from one ' +
            'set of props: a loading `Skeleton` placeholder, an inline ' +
            '`ErrorStatus` (when `errorMessage` is set), a `NotAvailable` marker ' +
            '(when the value is `null`/`undefined`), or the value itself.',
          whenToUse:
            'Anywhere you render a single value fetched from an API and want ' +
            'consistent loading/error/empty handling without repeating the ' +
            'if/else in every cell. Pass a `children` render function to format ' +
            'the loaded value.',
          migration: 'bui',
          extra:
            'The loading state renders a bui (`@backstage/ui`) `Skeleton`; the ' +
            '`height` prop sets its height (default `24`).',
        }),
      },
    },
  },
} satisfies Meta<typeof AsyncValue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  render: () => (
    <AsyncValue value="v1.29.4" isLoading={false}>
      {version => <strong>{version}</strong>}
    </AsyncValue>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The value is present and formatted via the `children` render function.',
      },
    },
  },
};

export const Loading: Story = {
  render: () => <AsyncValue value={undefined} isLoading />,
  parameters: {
    docs: {
      description: {
        story: 'While loading, a `Skeleton` placeholder is shown.',
      },
    },
  },
};

export const NotAvailableState: Story = {
  name: 'Not available',
  render: () => <AsyncValue value={null} isLoading={false} />,
  parameters: {
    docs: {
      description: {
        story:
          'A `null`/`undefined` value renders the `NotAvailable` (`n/a`) marker.',
      },
    },
  },
};

export const ErrorState: Story = {
  name: 'Error',
  render: () => (
    <AsyncValue
      value={undefined}
      isLoading={false}
      errorMessage="Request failed with status 503"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'An `errorMessage` renders the default `ErrorStatus` (hover the icon for ' +
          'the message). Pass `renderError` to customise this.',
      },
    },
  },
};
