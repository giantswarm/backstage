import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BackendWriteState } from '../../hooks/useModelManagerBackends';
import { RemoveModelBackendDialog } from './RemoveModelBackendDialog';

const write: jest.Mocked<BackendWriteState> = {
  dryRunAdd: jest.fn(),
  add: jest.fn(),
  dryRunRemove: jest.fn(),
  remove: jest.fn(),
  isBusy: false,
  failure: undefined,
  reset: jest.fn(),
};

jest.mock('../../hooks/useModelManagerBackends', () => ({
  // The real hook re-renders its caller when a write fails (`setFailure`);
  // the mock re-renders too, so the dialog reads the failure set on `write`.
  useBackendWrite: () => {
    const [, rerender] = jest.requireActual('react').useState(0);
    const rerendering =
      <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        try {
          return await fn(...args);
        } catch (error) {
          rerender((n: number) => n + 1);
          throw error;
        }
      };
    return {
      ...write,
      dryRunAdd: rerendering(write.dryRunAdd),
      add: rerendering(write.add),
      dryRunRemove: rerendering(write.dryRunRemove),
      remove: rerendering(write.remove),
    };
  },
}));

const onRemoved = jest.fn();

function renderDialog() {
  return render(
    <RemoveModelBackendDialog
      installation="inst-1"
      kind="ollama"
      servedModels={['Llama 3.2 3B', 'smollm2:135m']}
      isOpen
      onOpenChange={jest.fn()}
      onRemoved={onRemoved}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  write.failure = undefined;
});

describe('RemoveModelBackendDialog', () => {
  it('dry-runs remove_backend on open, lists what goes, and removes after the kind is typed', async () => {
    write.dryRunRemove.mockResolvedValue({
      dryRun: true,
      configMap: { namespace: 'agent-platform', name: 'model-backend-ollama' },
      modelConfigs: ['kagent/llama3-2-3b', 'kagent/smollm2-135m'],
    });
    write.remove.mockResolvedValue({
      dryRun: false,
      configMap: { namespace: 'agent-platform', name: 'model-backend-ollama' },
      unwired: ['kagent/llama3-2-3b', 'kagent/smollm2-135m'],
      removed: true,
      deregistered: true,
    });
    renderDialog();

    expect(write.dryRunRemove).toHaveBeenCalledWith('ollama');
    const plan = await screen.findByTestId('remove-plan');
    expect(plan).toHaveTextContent(
      'ConfigMap agent-platform/model-backend-ollama',
    );
    expect(plan).toHaveTextContent(
      'Model configs unwired: kagent/llama3-2-3b, kagent/smollm2-135m',
    );
    expect(plan).toHaveTextContent(
      'Served models leaving this page: Llama 3.2 3B, smollm2:135m',
    );

    const confirm = screen.getByRole('button', { name: 'Remove backend' });
    expect(confirm).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/Type ollama to confirm/),
      'ollama',
    );
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(write.remove).toHaveBeenCalledWith('ollama', 'apply');
    expect(
      await screen.findByText('Removed the Ollama backend as you'),
    ).toBeInTheDocument();
    expect(onRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ removed: true }),
    );
  });

  it("shows model-manager's refusal verbatim and never enables the confirm", async () => {
    write.dryRunRemove.mockImplementation(async () => {
      write.failure = {
        kind: 'refused',
        message:
          'conflict: backend ollama is configured statically by the chart values (--backends) and cannot be removed here',
      };
      throw new Error(write.failure.message);
    });
    renderDialog();

    await waitFor(() =>
      expect(screen.getByText(/cannot be removed here/)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('remove-plan')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove backend' }),
    ).toBeDisabled();
    expect(write.remove).not.toHaveBeenCalled();
  });
});
