import { useState } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SESSION_NAME_MAX_LENGTH,
  SessionRenameDialog,
} from './SessionRenameDialog';

const onConfirm = jest.fn();
const onOpenChange = jest.fn();

type Overrides = {
  title?: string;
  isRenaming?: boolean;
  error?: string;
  isUserScoped?: boolean;
};

const renderDialog = ({
  title = 'What issues are assigned to me?',
  isRenaming = false,
  error,
  isUserScoped,
}: Overrides = {}) =>
  renderInTestApp(
    <SessionRenameDialog
      title={title}
      isOpen
      onOpenChange={onOpenChange}
      isRenaming={isRenaming}
      error={error}
      onConfirm={onConfirm}
      isUserScoped={isUserScoped}
    />,
  );

const nameField = () => screen.getByRole('textbox', { name: /Session name/ });
const saveButton = () => screen.getByRole('button', { name: /Save/ });

beforeEach(() => {
  onConfirm.mockReset();
  onOpenChange.mockReset();
});

describe('SessionRenameDialog', () => {
  it('starts from the name the session already has', async () => {
    // Renaming is nearly always an edit of the existing title, not a fresh one —
    // kagent derives these from the first message and truncates them to 20
    // characters, so the usual job is finishing a sentence it cut off.
    await renderDialog();

    expect(nameField()).toHaveValue('What issues are assigned to me?');
  });

  it('puts the cursor straight in the field', async () => {
    // react-aria focuses the dialog container, not the first tabbable element, so
    // the field needs `autoFocus` to be typeable on open — and that prop carries an
    // eslint exception, which is worth having a test behind.
    await renderDialog();

    await waitFor(() => expect(nameField()).toHaveFocus());
  });

  it('submits the trimmed name', async () => {
    await renderDialog();

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '  Quarterly capacity review  ');
    await userEvent.click(saveButton());

    expect(onConfirm).toHaveBeenCalledWith('Quarterly capacity review');
  });

  it('submits on Enter, because it is a form', async () => {
    await renderDialog();

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Cluster upgrade{Enter}');

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith('Cluster upgrade'),
    );
  });

  it.each([
    ['empty', ''],
    ['only whitespace', '   '],
  ])('refuses to submit a name that is %s', async (_label, value) => {
    // A whitespace-only name would be stored and then render as a blank heading,
    // which looks like a broken page rather than a bad name.
    await renderDialog();

    await userEvent.clear(nameField());
    if (value) {
      await userEvent.type(nameField(), value);
    }

    expect(saveButton()).toBeDisabled();
    await userEvent.click(saveButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('caps the name at the length the backend also enforces', async () => {
    await renderDialog();

    expect(nameField()).toHaveAttribute(
      'maxLength',
      String(SESSION_NAME_MAX_LENGTH),
    );
  });

  it('stays open and shows why when the rename failed', async () => {
    // The dialog is the only place left to report this: closing on submit would
    // throw away the one surface the user was still looking at.
    await renderDialog({ error: 'kagent returned status 500' });

    expect(screen.getByText('kagent returned status 500')).toBeInTheDocument();
    expect(nameField()).toBeInTheDocument();
  });

  it('locks itself while the rename is in flight', async () => {
    // A stray click outside must not orphan a write already on its way to kagent.
    await renderDialog({ isRenaming: true });

    expect(screen.getByRole('button', { name: /Cancel/ })).toBeDisabled();
    expect(screen.getByText('Saving…')).toBeInTheDocument();
  });

  it('warns when the deployment does not scope sessions per user', async () => {
    // Same caveat the delete dialog carries: under `unsecure` mode kagent serves
    // one shared user, so this may be somebody else's session to name.
    await renderDialog({ isUserScoped: false });

    expect(
      screen.getByText(/may have been started by somebody else/),
    ).toBeInTheDocument();
  });

  it.each([
    ['user-scoped', true],
    ['unresolved', undefined],
  ])('claims nothing when the probe says %s', async (_label, isUserScoped) => {
    await renderDialog({ isUserScoped });

    expect(
      screen.queryByText(/may have been started by somebody else/),
    ).not.toBeInTheDocument();
  });

  it('forgets an abandoned edit when reopened', async () => {
    // Otherwise a cancelled attempt sits in the field waiting to be submitted by
    // accident the next time the dialog opens.
    function Harness() {
      const [isOpen, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(open => !open)}>
            toggle
          </button>
          <SessionRenameDialog
            title="Original name"
            isOpen={isOpen}
            onOpenChange={setOpen}
            isRenaming={false}
            onConfirm={onConfirm}
          />
        </>
      );
    }

    await renderInTestApp(<Harness />);

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'abandoned edit');

    // Closed through the dialog's own Cancel: it is modal, so while it is open
    // everything behind it is out of the accessibility tree and the toggle cannot
    // be found — which is exactly what a user experiences too.
    await userEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: /Session name/ }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));

    expect(
      await screen.findByRole('textbox', { name: /Session name/ }),
    ).toHaveValue('Original name');
  });
});
