import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button, Flex, Text } from '@backstage/ui';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
  usePageHeaderActionsSlot,
} from './PageHeaderActions';
import { componentDocs } from '../../storybook/docs';

// A stand-in for the app's page header: it renders whatever actions the routed
// content has registered into the slot.
function DemoHeader() {
  const actions = usePageHeaderActionsSlot();
  return (
    <Flex
      justify="between"
      align="center"
      style={{
        padding: 12,
        borderBottom: '1px solid var(--bui-border)',
        marginBottom: 16,
      }}
    >
      <Text weight="bold">Page header (owned by the layout)</Text>
      <Flex align="center" gap="1">
        {actions ?? <Text variant="body-small">no actions registered</Text>}
      </Flex>
    </Flex>
  );
}

// Routed content that contributes header actions without rendering its own header.
function DemoContent() {
  const [registered, setRegistered] = useState(true);
  // Memoize the element so the register-on-render effect doesn't loop.
  const actions = useMemo(
    () =>
      registered ? (
        <>
          <Button variant="secondary" size="small">
            Cancel
          </Button>
          <Button variant="primary" size="small">
            Review
          </Button>
        </>
      ) : null,
    [registered],
  );
  useProvidePageHeaderActions(actions);

  return (
    <Button onClick={() => setRegistered(r => !r)}>
      {registered ? 'Unregister header actions' : 'Register header actions'}
    </Button>
  );
}

const meta = {
  title: 'Components/PageHeaderActions',
  component: PageHeaderActionsProvider,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A headless slot (context + hooks, no markup of its own) that lets ' +
            'routed page content contribute action buttons to the surrounding page ' +
            'header owned by the layout. `PageHeaderActionsProvider` holds the slot, ' +
            '`useProvidePageHeaderActions(node)` registers actions for as long as ' +
            'the caller is mounted, and `usePageHeaderActionsSlot()` reads them for ' +
            'the header to render.',
          whenToUse:
            'In tabbed/sub-routed sections where the single header belongs to the ' +
            'page layout, but a specific tab needs its own actions (e.g. a create ' +
            'form’s Cancel/Review). Pass a memoized element to the register hook so ' +
            'the effect doesn’t re-run every render.',
          migration: 'none',
        }),
      },
    },
  },
} satisfies Meta<typeof PageHeaderActionsProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Demo: Story = {
  render: () => (
    <PageHeaderActionsProvider>
      <DemoHeader />
      <DemoContent />
    </PageHeaderActionsProvider>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Toggle the button below: the content registers/unregisters actions and ' +
          'the header (rendered above, by the “layout”) reflects the change.',
      },
    },
  },
};
