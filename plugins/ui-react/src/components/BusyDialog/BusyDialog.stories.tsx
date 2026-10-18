import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import { BusyDialog, type BusyDialogProps } from './BusyDialog';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/BusyDialog',
  component: BusyDialog,
  tags: ['autodocs'],
  args: {
    isOpen: true,
    onOpenChange: () => {},
    isBusy: false,
    width: 'min(90vw, 520px)',
    children: close => (
      <>
        <DialogHeader>Rename session</DialogHeader>
        <DialogBody>
          <Text variant="body-medium">
            Escape, a click outside, the header&apos;s close button and Cancel
            all close this dialog, except while it is busy.
          </Text>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onPress={close}>
            Cancel
          </Button>
        </DialogFooter>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A controlled bui `Dialog` that stays open while `isBusy`: ' +
            'Escape, a click outside, the header close button and the ' +
            '`close` it hands its children all do nothing until the request ' +
            'settles.',
          whenToUse:
            'For every dialog that sends a write: a stray dismissal must not ' +
            'orphan a request already on its way to a server. Pass the ' +
            "children as a function and wire the footer's Cancel to its " +
            '`close`, so no close path is left ungated. `ConfirmDialog` is ' +
            'built on it.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof BusyDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Owns the open/busy state, so the lock can be tried out.
const BusyDialogExample = (args: BusyDialogProps) => {
  const [isOpen, setOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);

  const save = () => {
    setBusy(true);
    // Stands in for the request the caller would make.
    window.setTimeout(() => {
      setBusy(false);
      setOpen(false);
    }, 2000);
  };

  return (
    <Flex direction="column" gap="3" style={{ alignItems: 'flex-start' }}>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Rename…
      </Button>
      <BusyDialog
        {...args}
        isOpen={isOpen}
        onOpenChange={setOpen}
        isBusy={isBusy}
      >
        {close => (
          <>
            <DialogHeader>Rename session</DialogHeader>
            <DialogBody>
              <Text variant="body-medium">
                Save, then try Escape, a click outside or Cancel while it saves.
              </Text>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onPress={close} isDisabled={isBusy}>
                Cancel
              </Button>
              <Button variant="primary" onPress={save} isPending={isBusy}>
                {isBusy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </>
        )}
      </BusyDialog>
    </Flex>
  );
};

/** Open, save, and try to leave while the save runs. */
export const Interactive: Story = {
  render: args => <BusyDialogExample {...args} />,
};

/** At rest: every close path works. */
export const Open: Story = {};

/** Mid-request: every close path is shut. */
export const Busy: Story = {
  args: { isBusy: true },
};
