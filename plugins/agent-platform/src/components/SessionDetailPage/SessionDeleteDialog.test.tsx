import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
  describeSessionDeleteFailure,
  SESSION_DELETE_SETTLING_HINT_MS,
  SessionDeleteDialog,
} from './SessionDeleteDialog';

const SETTLING = /Waiting for the session's last turn to settle/;

const renderDialog = (isDeleting: boolean) =>
  renderInTestApp(
    <SessionDeleteDialog
      title="Ingress check"
      isOpen
      onOpenChange={() => {}}
      isDeleting={isDeleting}
      onConfirm={() => {}}
    />,
  );

describe('SessionDeleteDialog', () => {
  it('says what a long delete waits for once it runs past the hint', async () => {
    await renderDialog(true);

    // An ordinary delete answers before the hint: nothing extra at first.
    expect(screen.queryByText(SETTLING)).not.toBeInTheDocument();
    expect(
      await screen.findByRole(
        'status',
        {},
        { timeout: SESSION_DELETE_SETTLING_HINT_MS + 1_000 },
      ),
    ).toHaveTextContent(SETTLING);
  });

  it('says nothing about settling while no delete runs', async () => {
    await renderDialog(false);
    await new Promise(resolve =>
      setTimeout(resolve, SESSION_DELETE_SETTLING_HINT_MS + 100),
    );
    expect(screen.queryByText(SETTLING)).not.toBeInTheDocument();
  });
});

describe('describeSessionDeleteFailure', () => {
  const error = new Error('Unavailable: Failed to delete Session');

  it('explains a failed delete on a lost runtime', () => {
    expect(
      describeSessionDeleteFailure(error, { reported: true, attempts: 1 }),
    ).toMatch(/this runtime was lost with its platform node/);
  });

  it('keeps the backend’s message where only sends kept timing out', () => {
    // Nothing says the runtime's node went away.
    expect(
      describeSessionDeleteFailure(error, {
        reported: false,
        attempts: 2,
        source: 'send-timeouts',
      }),
    ).toBe(error.message);
  });
});
