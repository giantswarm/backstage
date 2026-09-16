import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BackendWriteState } from '../../hooks/useModelManagerBackends';
import type { AddBackendResult } from '../../lib/modelManagerBackends';
import {
  AddModelBackendDialog,
  toAddBackendInput,
} from './AddModelBackendDialog';

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

jest.mock('../CodeBlock', () => ({
  // The editor does not lay text out in jsdom; the document as plain text.
  CodeBlock: ({
    filename,
    content,
  }: {
    filename?: string;
    content: string;
  }) => (
    <pre data-testid="code-block" data-filename={filename}>
      {content}
    </pre>
  ),
}));

jest.mock('../ConnectAgentManagerAlert', () => ({
  ConnectAgentManagerAlert: ({
    server,
    message,
  }: {
    server: string;
    message: string;
  }) => (
    <div>
      connect {server}: {message}
    </div>
  ),
}));

const DOCUMENT = `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelBackend
metadata:
  name: ollama
spec:
  kind: ollama
  source: person
  endpoint: http://ollama.lab:11434
`;

const review: AddBackendResult = {
  dryRun: true,
  document: DOCUMENT,
  configMap: {
    namespace: 'agent-platform',
    name: 'model-backend-ollama',
    labels: { 'agent-platform.giantswarm.io/model-backend': 'true' },
  },
};

const onDeployed = jest.fn();

function renderDialog(registered: Array<'ollama' | 'kserve'> = []) {
  return render(
    <AddModelBackendDialog
      installations={['inst-1']}
      registeredKinds={() => registered}
      isOpen
      onOpenChange={jest.fn()}
      onDeployed={onDeployed}
    />,
  );
}

/** Pick a kind from the bui Select (a react-aria listbox). */
async function pickKind(label: string) {
  await userEvent.click(screen.getByRole('button', { name: /Kind/ }));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

beforeEach(() => {
  jest.clearAllMocks();
  write.failure = undefined;
  write.isBusy = false;
});

describe('toAddBackendInput', () => {
  it('needs a valid endpoint for a host kind and sends the Secret reference only', () => {
    const form = {
      endpoint: 'ollama.lab',
      agentEndpoint: '',
      credentialsSecret: 'ollama-token',
      credentialsKey: 'token',
      target: 'local' as const,
      cluster: '',
      organization: '',
      apiServer: '',
      caBundle: '',
      servingNamespace: '',
      discoveryNamespace: '',
      discoveryName: '',
    };
    expect(toAddBackendInput('ollama', form)).toBeUndefined();
    expect(
      toAddBackendInput('ollama', {
        ...form,
        endpoint: 'http://ollama.lab:11434',
      }),
    ).toEqual({
      kind: 'ollama',
      endpoint: 'http://ollama.lab:11434',
      agentEndpoint: '',
      credentialsSecret: 'ollama-token',
      credentialsKey: 'token',
    });
  });

  it('needs the serving namespace for kserve, and the apiserver and CA for a remote target', () => {
    const form = {
      endpoint: '',
      agentEndpoint: '',
      credentialsSecret: '',
      credentialsKey: '',
      target: 'remote' as const,
      cluster: 'gpu01',
      organization: 'giantswarm',
      apiServer: 'https://api.gpu01.example.com:6443',
      caBundle: '',
      servingNamespace: 'model-serving',
      discoveryNamespace: '',
      discoveryName: '',
    };
    expect(toAddBackendInput('kserve', form)).toBeUndefined();
    expect(
      toAddBackendInput('kserve', { ...form, caBundle: 'PEM' }),
    ).toMatchObject({
      kind: 'kserve',
      cluster: 'gpu01',
      apiServer: 'https://api.gpu01.example.com:6443',
      caBundle: 'PEM',
      servingNamespace: 'model-serving',
    });
    expect(toAddBackendInput('kserve', { ...form, target: 'local' })).toEqual({
      kind: 'kserve',
      cluster: 'local',
      servingNamespace: 'model-serving',
      discoveryNamespace: '',
      discoveryName: '',
    });
  });
});

describe('AddModelBackendDialog', () => {
  it('offers only the kinds not registered yet', async () => {
    renderDialog(['ollama', 'kserve']);
    await userEvent.click(screen.getByRole('button', { name: /Kind/ }));
    const options = await screen.findAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      'LM Studio',
      'Lemonade',
    ]);
  });

  it('dry-runs add_backend on Review and shows the document, then deploys with mode apply', async () => {
    write.dryRunAdd.mockResolvedValue(review);
    write.add.mockResolvedValue({
      ...review,
      dryRun: false,
      created: true,
      registered: true,
    });
    renderDialog();

    await pickKind('Ollama');
    const reviewButton = screen.getByRole('button', { name: 'Review' });
    expect(reviewButton).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/^Endpoint/),
      'http://ollama.lab:11434',
    );
    await userEvent.type(
      screen.getByLabelText(/Credentials Secret/),
      'ollama-token',
    );
    await userEvent.click(reviewButton);

    expect(write.dryRunAdd).toHaveBeenCalledWith({
      kind: 'ollama',
      endpoint: 'http://ollama.lab:11434',
      agentEndpoint: '',
      credentialsSecret: 'ollama-token',
      credentialsKey: '',
    });
    expect(await screen.findByTestId('backend-review')).toHaveTextContent(
      'ConfigMap agent-platform/model-backend-ollama on inst-1',
    );
    expect(screen.getByText(/kind: ModelBackend/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Deploy' }));
    expect(write.add).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ollama' }),
      'apply',
    );
    expect(
      await screen.findByText(/Registered model-backend-ollama as you/),
    ).toBeInTheDocument();
    expect(onDeployed).toHaveBeenCalledWith(
      'inst-1',
      expect.objectContaining({ created: true }),
    );
    // Done: the footer offers Close only (the success Alert has a Close of its own).
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Deploy' }),
    ).not.toBeInTheDocument();
  });

  it('commits with mode commit and shows the connect step on auth_required', async () => {
    write.dryRunAdd.mockResolvedValue(review);
    write.add.mockResolvedValue({
      ...review,
      status: 'auth_required',
      authUrl: 'https://muster.example/connect',
      message: 'no GitHub grant yet',
    });
    renderDialog();
    await pickKind('Lemonade');
    await userEvent.type(
      screen.getByLabelText(/^Endpoint/),
      'http://lemonade.lab:8000',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('backend-review');

    await userEvent.click(screen.getByRole('button', { name: 'Commit' }));
    expect(write.add).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'lemonade' }),
      'commit',
    );
    expect(
      await screen.findByText('Connect the repository first'),
    ).toBeInTheDocument();
    expect(screen.getByText('no GitHub grant yet')).toBeInTheDocument();
  });

  it("shows model-manager's refusal verbatim and stays open", async () => {
    write.dryRunAdd.mockImplementation(async () => {
      write.failure = {
        kind: 'refused',
        message:
          'conflict: backend ollama is configured statically by the chart values (--backends); remove it there to register it at runtime',
      };
      throw new Error(write.failure.message);
    });
    renderDialog();
    await pickKind('Ollama');
    await userEvent.type(
      screen.getByLabelText(/^Endpoint/),
      'http://ollama.lab:11434',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));

    await waitFor(() =>
      expect(
        screen.getByText(/configured statically by the chart values/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('model-manager refused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('offers the muster connect step when the session is not connected to model-manager', async () => {
    write.dryRunAdd.mockImplementation(async () => {
      write.failure = {
        kind: 'not-connected',
        message: 'tool not found: x_model-manager_add_backend',
      };
      throw new Error(write.failure.message);
    });
    renderDialog();
    await pickKind('Ollama');
    await userEvent.type(
      screen.getByLabelText(/^Endpoint/),
      'http://ollama.lab:11434',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(
      await screen.findByText(/connect model-manager: tool not found/),
    ).toBeInTheDocument();
  });
});
