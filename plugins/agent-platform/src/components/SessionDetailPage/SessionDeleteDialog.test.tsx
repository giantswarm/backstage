import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
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
