import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { identityApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import type { InventoryFailure } from '../../apis/installationInventory/inventoryFailure';
import { InventoryProbeError } from '../../apis/installationInventory/probeInstallationInventory';
import { InventoryFailureGate } from './InventoryFailureGate';

const UNAUTHORIZED: InventoryFailure = {
  installation: 'gazelle',
  kind: 'unauthorized',
  error: new InventoryProbeError('gazelle', 401, ''),
};
const FORBIDDEN: InventoryFailure = {
  installation: 'gazelle',
  kind: 'forbidden',
  error: new InventoryProbeError('gazelle', 403, 'Forbidden'),
};
const TIMED_OUT: InventoryFailure = {
  installation: 'gazelle',
  kind: 'error',
  error: new Error('Request to cluster gazelle timed out after 30000ms'),
};

function renderGate(
  failure: InventoryFailure,
  props: { onRetry?: () => void; context?: string } = {},
) {
  const signOut = jest.fn().mockResolvedValue(undefined);
  const onRetry = props.onRetry ?? jest.fn();
  render(
    <TestApiProvider apis={[[identityApiRef, { signOut }]]}>
      <InventoryFailureGate
        failure={failure}
        onRetry={onRetry}
        context={props.context}
      />
    </TestApiProvider>,
  );
  return { signOut, onRetry };
}

describe('InventoryFailureGate', () => {
  it('names the installation, quotes the 401 and signs out of the portal on click', async () => {
    const user = userEvent.setup();
    const { signOut, onRetry } = renderGate(UNAUTHORIZED);

    expect(
      screen.getByText(
        "The API server of gazelle rejected the portal's token (HTTP 401): your sign-in did not grant what it requires, and a silent refresh cannot repair that. Sign out of the portal and sign in again.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('offers a retry for a 403, quoting the reason', async () => {
    const user = userEvent.setup();
    const { signOut, onRetry } = renderGate(FORBIDDEN);

    expect(screen.getByText(/HTTP 403 Forbidden/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("offers a retry for any other failure, quoting the error's words", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderGate(TIMED_OUT);

    expect(
      screen.getByText(
        'Reading the API groups of gazelle failed (Request to cluster gazelle timed out after 30000ms).',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('leads with the context sentence when given one', () => {
    renderGate(FORBIDDEN, {
      context:
        'Which installations run kagent is read through their Kubernetes API.',
    });

    expect(
      screen.getByText(
        /^Which installations run kagent is read through their Kubernetes API\. The API server of gazelle refused/,
      ),
    ).toBeInTheDocument();
  });
});
