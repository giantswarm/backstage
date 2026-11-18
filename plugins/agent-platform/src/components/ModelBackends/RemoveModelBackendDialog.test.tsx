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
  isWriting: false,
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

jest.mock('../ConnectAgentManagerAlert', () => ({
  ConnectAgentManagerAlert: ({
    server,
    message,
    onSignedIn,
  }: {
    server: string;
    message: string;
    onSignedIn?: () => void;
  }) => (
    <div>
      connect {server}: {message}
      {/* What the alert's sign-in calls once it lands. */}
      {onSignedIn && (
        <button type="button" onClick={onSignedIn}>
          Sign-in lands
        </button>
      )}
    </div>
  ),
}));

const onRemoved = jest.fn();
const onOpenChange = jest.fn();

function renderDialog() {
  return render(
    <RemoveModelBackendDialog
      installation="inst-1"
      kind="ollama"
      servedModels={['Llama 3.2 3B', 'smollm2:135m']}
      isOpen
      onOpenChange={onOpenChange}
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
    // Pressable once the plan is in; pressed before the kind is typed, the
    // field says so and takes the focus.
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(write.remove).not.toHaveBeenCalled();
    const typed = screen.getByRole('textbox', {
      name: /Type ollama to confirm/,
    });
    expect(typed).toHaveAttribute('aria-invalid', 'true');
    expect(typed).toHaveFocus();
    expect(
      screen.getByText('Type ollama to confirm the removal.'),
    ).toBeInTheDocument();

    await userEvent.type(typed, 'ollama');
    expect(typed).not.toHaveAttribute('aria-invalid');
    await userEvent.click(confirm);

    expect(write.remove).toHaveBeenCalledWith('ollama', 'apply');
    // The caller's toast is the one confirmation: the dialog closes.
    await waitFor(() =>
      expect(onRemoved).toHaveBeenCalledWith(
        expect.objectContaining({ removed: true }),
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText(/as you/)).not.toBeInTheDocument();
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

  // The dry run that opens the dialog asks again once the sign-in lands; the
  // removal itself is never sent again by itself.
  it('asks the dry run again once the sign-in lands, and never removes by itself', async () => {
    const notConnected = () => {
      write.failure = {
        kind: 'not-connected',
        message: 'tool not found: x_model-manager_remove_backend',
      };
      return Promise.reject(new Error(write.failure.message));
    };
    write.dryRunRemove.mockImplementationOnce(notConnected).mockResolvedValue({
      dryRun: true,
      configMap: { namespace: 'agent-platform', name: 'model-backend-ollama' },
      modelConfigs: [],
    });
    write.reset.mockImplementation(() => {
      write.failure = undefined;
    });
    renderDialog();
    expect(
      await screen.findByText(/connect model-manager: tool not found/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign-in lands' }),
    );

    expect(write.reset).toHaveBeenCalled();
    await waitFor(() => expect(write.dryRunRemove).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByLabelText(/Type ollama to confirm/),
    ).toBeInTheDocument();
    expect(write.remove).not.toHaveBeenCalled();
  });

  it('clears a removal refused for want of the sign-in once it lands, without removing again', async () => {
    write.dryRunRemove.mockResolvedValue({
      dryRun: true,
      configMap: { namespace: 'agent-platform', name: 'model-backend-ollama' },
      modelConfigs: [],
    });
    write.remove.mockImplementationOnce(() => {
      write.failure = {
        kind: 'not-connected',
        message: 'tool not found: x_model-manager_remove_backend',
      };
      return Promise.reject(new Error(write.failure.message));
    });
    write.reset.mockImplementation(() => {
      write.failure = undefined;
    });
    renderDialog();
    await userEvent.type(
      await screen.findByLabelText(/Type ollama to confirm/),
      'ollama',
    );
    await userEvent.click(screen.getByRole('button', { name: /^Remove/ }));
    await screen.findByText(/connect model-manager: tool not found/);

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign-in lands' }),
    );

    expect(write.reset).toHaveBeenCalled();
    expect(write.remove).toHaveBeenCalledTimes(1);
    // The plan stands: nothing to ask again.
    expect(write.dryRunRemove).toHaveBeenCalledTimes(1);
    expect(onRemoved).not.toHaveBeenCalled();
  });
});
