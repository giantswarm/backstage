import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button, Flex, Text } from '@backstage/ui';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  args: {
    // The three required props live here so every story inherits them: a story
    // that only sets `render` would otherwise have to repeat them to satisfy
    // `StoryObj`'s required-args check. The interactive stories override all
    // three with their own state.
    isOpen: true,
    onOpenChange: () => {},
    onConfirm: () => {},
    title: 'Delete agent "Issue Tracker"?',
    destructive: true,
    confirmLabel: 'Delete agent',
    busyLabel: 'Deleting…',
    children: (
      <Text variant="body-medium">
        This ends any session currently running with this agent — including
        sessions started by other people, which are not shown to you.
      </Text>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A modal that asks before doing something the user cannot take ' +
            'back. Controlled via `isOpen`/`onOpenChange`, with a `destructive` ' +
            'confirm button, a busy state for the action in flight, and a slot ' +
            'for the error if it fails.',
          whenToUse:
            'Before any irreversible action — deleting a resource, discarding ' +
            'work. Put only what the reader cannot work out for themselves in ' +
            'the body: the consequence they would not have predicted, not a ' +
            'recap of the mechanics. Keep it to a sentence or two; a modal is ' +
            'read at the moment of deciding, not studied.',
          migration: 'bui',
          extra:
            'Two behaviours worth knowing before extending it.\n\n' +
            '**Confirming does not close it.** The caller closes it, once it ' +
            'knows the action succeeded — so run the action, pass `isBusy` ' +
            'while it is in flight and `error` if it fails. A dialog that ' +
            'dismissed itself on confirm would throw away the only place a ' +
            'failure could be reported.\n\n' +
            '**It is controlled, not a `DialogTrigger` wrapper.** That is the ' +
            'only thing that works when the trigger is a `MenuItem`: ' +
            'react-aria unmounts the menu on selection, taking any trigger ' +
            'inside it along. While `isBusy` it is also undismissable, so a ' +
            'stray click or Escape cannot orphan a request already on its way ' +
            'to a server.',
        }),
      },
    },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// A small component so the interactive stories can own the open/busy state
// (hooks belong in a component, not a bare `render` callback).
const ConfirmDialogExample = ({
  outcome = 'success',
  ...args
}: ConfirmDialogProps & { outcome?: 'success' | 'failure' }) => {
  const [isOpen, setOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const confirm = () => {
    setError(undefined);
    setBusy(true);

    // Stands in for the request the caller would make.
    window.setTimeout(() => {
      setBusy(false);
      if (outcome === 'failure') {
        setError(
          'helmreleases.helm.toolkit.fluxcd.io "issue-tracker" is forbidden',
        );
        return;
      }
      setOpen(false);
    }, 1200);
  };

  return (
    <Flex direction="column" gap="3" style={{ alignItems: 'flex-start' }}>
      <Button
        variant="secondary"
        destructive
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        Delete agent…
      </Button>
      <ConfirmDialog
        {...args}
        isOpen={isOpen}
        onOpenChange={setOpen}
        isBusy={isBusy}
        error={error}
        onConfirm={confirm}
      />
    </Flex>
  );
};

/** The whole flow: open, confirm, watch it work, and close on success. */
export const Interactive: Story = {
  render: args => <ConfirmDialogExample {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          'Confirming starts a fake request that takes a moment and then ' +
          'succeeds, at which point the caller closes the dialog.',
      },
    },
  },
};

/** The same flow when the action is refused — the dialog stays put and explains. */
export const ConfirmFails: Story = {
  render: args => <ConfirmDialogExample {...args} outcome="failure" />,
  parameters: {
    docs: {
      description: {
        story:
          'The action fails, so the dialog stays open and renders `error` ' +
          'above the buttons. This is why confirming does not close it.',
      },
    },
  },
};

/** Open, at rest — the state the docs page is most useful showing. */
export const Open: Story = {};

/** Mid-flight: both buttons locked, confirm reporting progress. */
export const Busy: Story = {
  args: { isBusy: true },
};

/** A non-destructive confirmation, with its own labels. */
export const NonDestructive: Story = {
  args: {
    destructive: false,
    title: 'Discard your changes?',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    children: (
      <Text variant="body-medium">
        The values you entered will not be saved.
      </Text>
    ),
  },
};
