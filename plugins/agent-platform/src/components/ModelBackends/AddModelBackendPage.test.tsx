import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import type { BackendWriteState } from '../../hooks/useModelManagerBackends';
import type { AddBackendResult } from '../../lib/modelManagerBackends';
import { committedTo } from '../../lib/__fixtures__/gitOpsCommit';
import { AddModelBackendPage, toAddBackendInput } from './AddModelBackendPage';

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
  // the mock re-renders too, so the page reads the failure set on `write`.
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

function renderPage(
  registered: Array<'ollama' | 'kserve'> = [],
  installations: string[] = ['inst-1'],
) {
  // The review's copy button reports a failed copy through the errorApi.
  return render(
    <TestApiProvider apis={[[errorApiRef, { post: jest.fn() }]]}>
      <MemoryRouter>
        <PageHeaderActionsProvider>
          <AddModelBackendPage
            installations={installations}
            registeredKinds={() => registered}
            closeHref="/customize/models/hosting"
            onDeployed={onDeployed}
          />
        </PageHeaderActionsProvider>
      </MemoryRouter>
    </TestApiProvider>,
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
  write.isWriting = false;
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

describe('AddModelBackendPage', () => {
  it('offers only the kinds not registered yet', async () => {
    renderPage(['ollama', 'kserve']);
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
    renderPage();

    await pickKind('Ollama');
    const reviewButton = screen.getByRole('button', { name: 'Review' });
    // Review stays pressable; a blocked one says what is missing on the field.
    await userEvent.click(reviewButton);
    expect(write.dryRunAdd).not.toHaveBeenCalled();
    const endpoint = screen.getByRole('textbox', { name: /^Endpoint/ });
    expect(endpoint).toHaveAttribute('aria-invalid', 'true');
    expect(endpoint).toHaveFocus();
    expect(
      screen.getByText('Enter the URL model-manager reaches the backend at.'),
    ).toBeInTheDocument();
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
    // Done: nothing left to press but the way out.
    expect(
      screen.queryByRole('button', { name: 'Deploy' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
  });

  it('says on the Kind field that one is needed when Review is pressed without', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(write.dryRunAdd).not.toHaveBeenCalled();
    const kindTrigger = screen.getByRole('button', { name: /Kind/ });
    expect(kindTrigger).toHaveFocus();
    expect(kindTrigger).toHaveAccessibleDescription(
      /Pick the kind of backend\./,
    );
  });

  it('keeps the knobs whose defaults fit under More options, and opens it on a field inside that blocks Review', async () => {
    renderPage();
    await pickKind('Ollama');

    const more = screen.getByText('More options').closest('details')!;
    expect(more).not.toHaveAttribute('open');
    expect(more).toHaveTextContent('no credentials Secret');
    for (const label of [/^Agent endpoint/, /^Credentials Secret/]) {
      expect(more).toContainElement(screen.getByLabelText(label));
    }

    await userEvent.type(
      screen.getByLabelText(/^Endpoint/),
      'http://ollama.lab:11434',
    );
    await userEvent.type(screen.getByLabelText(/^Agent endpoint/), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(write.dryRunAdd).not.toHaveBeenCalled();
    expect(more).toHaveAttribute('open');
    const agentEndpoint = screen.getByRole('textbox', {
      name: /^Agent endpoint/,
    });
    expect(agentEndpoint).toHaveAttribute('aria-invalid', 'true');
    expect(agentEndpoint).toHaveFocus();
  });

  it('keeps the discovery ConfigMap of a KServe backend under More options', async () => {
    renderPage();
    await pickKind('KServe');

    const more = screen.getByText('More options').closest('details')!;
    expect(more).toHaveTextContent(
      'discovery ConfigMap in the serving namespace, agent-platform-model-serving',
    );
    expect(more).toContainElement(
      screen.getByLabelText(/^Discovery ConfigMap name\b/),
    );
    expect(more).not.toContainElement(
      screen.getByLabelText(/^Serving namespace/),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(
      screen.getByRole('textbox', { name: /^Serving namespace/ }),
    ).toHaveFocus();
    expect(
      screen.getByText('Enter the namespace the models are served in.'),
    ).toBeInTheDocument();
  });

  it('is a page of two steps whose review footer reads Cancel, Back, Commit, then Deploy last', async () => {
    write.dryRunAdd.mockResolvedValue(review);
    renderPage();
    await pickKind('Lemonade');
    await userEvent.type(
      screen.getByLabelText(/^Endpoint/),
      'http://lemonade.lab:8000',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('backend-review');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Add model backend' }),
    ).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Steps' });
    expect(within(steps).getByText('Review').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    const footer = screen
      .getByRole('button', { name: 'Deploy' })
      .closest('footer') as HTMLElement;
    expect(
      Array.from(footer.querySelectorAll('a, button')).map(
        control => control.textContent,
      ),
    ).toEqual(['Cancel', 'Back', 'Commit', 'Deploy']);
    expect(
      within(footer).getByRole('link', { name: 'Cancel' }),
    ).toHaveAttribute('href', '/customize/models/hosting');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText(/^Endpoint/)).toHaveValue(
      'http://lemonade.lab:8000',
    );
  });

  it('commits with mode commit and links the pull request', async () => {
    write.dryRunAdd.mockResolvedValue(review);
    write.add.mockResolvedValue({
      ...review,
      ...committedTo('https://github.com/giantswarm/agents/pull/12'),
    });
    renderPage();
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
      await screen.findByRole('link', { name: /Review pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/agents/pull/12');
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
    renderPage();
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
    renderPage();
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

describe('AddModelBackendPage · the environment select at scale', () => {
  const openEnvironments = async () =>
    userEvent.click(screen.getByRole('button', { name: /Environment/ }));

  it('offers three environments without a search', async () => {
    renderPage([], ['inst-1', 'inst-2', 'inst-3']);

    await openEnvironments();
    expect(
      await screen.findByRole('option', { name: 'inst-3' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('offers type-ahead over 300 environments', async () => {
    renderPage(
      [],
      Array.from({ length: 300 }, (_, i) => `inst-${i + 1}`),
    );

    await openEnvironments();
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
  });
});
