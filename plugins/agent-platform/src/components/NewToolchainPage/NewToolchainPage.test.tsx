import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { CreateToolchainResult } from '../../lib/toolchainManager';
import { toolchainsRouteRef } from '../../routes';
import { buildPollInterval, NewToolchainPage } from './NewToolchainPage';

const mockClient = {
  searchPackages: jest.fn(),
  addPackages: jest.fn(),
  buildStatus: jest.fn(),
};
let mockScope: Record<string, unknown>;
jest.mock('../../hooks/useToolchainManager', () => ({
  useScopedToolchainInstallations: () => mockScope,
  useToolchainManagerClient: () => mockClient,
  useToolchainSources: () => ({
    isPending: false,
    data: {
      sources: [
        {
          name: 'agent-toolchains',
          repository: 'giantswarm/agent-toolchains',
          offered: true,
        },
      ],
    },
  }),
}));
const mockCreate = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null as Error | null,
  data: undefined as CreateToolchainResult | undefined,
  // Renders the page again after a test sets `data`, as the mutation would.
  rerender: () => {},
};
jest.mock('../../hooks/useToolchainWrites', () => ({
  useCreateToolchain: () => {
    const [, rerender] = jest
      .requireActual('react')
      .useReducer((n: number) => n + 1, 0);
    mockCreate.rerender = rerender;
    return mockCreate;
  },
}));
/** muster's sign-in for an App, as the test moves it along. */
const mockSignIn = {
  isWaiting: false,
  isConnected: false,
  isPending: false,
  signInTabOpened: false,
  authUrl: 'https://muster.example/sign-in',
  error: undefined as string | undefined,
  signIn: jest.fn(),
};
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  useServerSignIn: () => mockSignIn,
}));
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  FileView: (props: { content: string; filename: string }) => (
    <pre data-testid="file-view" data-filename={props.filename}>
      {props.content}
    </pre>
  ),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[externalUrlConsentApiRef, { open: jest.fn() }]]}>
      <QueryClientProvider client={queryClient}>
        <NewToolchainPage />
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/customize/toolchains': toolchainsRouteRef } },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.isConnected = false;
  mockScope = { installations: ['gazelle'], hasToolchains: true };
  mockCreate.data = undefined;
  mockClient.searchPackages.mockResolvedValue({
    source: 'alpine',
    branches: ['v3.22'],
    packages: [
      {
        name: 'helm',
        description: 'The Kubernetes package manager',
        versions: { 'v3.22': '3.18.4-r1' },
      },
    ],
  });
  mockClient.addPackages.mockResolvedValue({
    toolchain: 'helm-tools',
    path: 'toolchains/helm-tools/Dockerfile',
    dockerfile: '# toolchain-manager: helm-tools',
  });
});

describe('NewToolchainPage', () => {
  it('says why no environment could be checked, and asks again, instead of reading forever', async () => {
    const recheck = jest.fn(() => Promise.resolve());
    mockScope = {
      installations: [],
      sharedIdentity: [],
      hasToolchains: 'unchecked',
      unchecked: [{ installation: 'gazelle', failure: 'notAnswering' }],
      recheck,
    };
    await renderPage();

    expect(
      screen.getByText('Toolchains could not be checked'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Muster on gazelle did not answer.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Reading the environments…'),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(recheck).toHaveBeenCalledTimes(1);
  });

  it('writes the Dockerfile from the picked packages and opens it as a pull request', async () => {
    await renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /Name/ }),
      'helm-tools',
    );
    await userEvent.type(
      screen.getByRole('searchbox', { name: /Search packages/ }),
      'helm',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Write Dockerfile' }),
    );

    expect(mockClient.addPackages).toHaveBeenCalledWith({
      name: 'helm-tools',
      packages: ['helm'],
    });
    expect(
      await screen.findByText('# toolchain-manager: helm-tools'),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Open pull request' }),
    );
    expect(mockCreate.mutate).toHaveBeenCalledWith({
      dockerfile: '# toolchain-manager: helm-tools',
      name: 'helm-tools',
      source: 'agent-toolchains',
    });
  });

  it('asks for the App grant when the Dockerfile is written without it, then writes it', async () => {
    mockClient.addPackages.mockResolvedValueOnce({
      status: 'grant_required',
      apps: ['toolchain-manager'],
    });
    await renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /Name/ }),
      'helm-tools',
    );
    await userEvent.type(
      screen.getByRole('searchbox', { name: /Search packages/ }),
      'helm',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Write Dockerfile' }),
    );

    expect(
      await screen.findByTestId('provider-connect-toolchain-manager'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('file-view')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).not.toBeInTheDocument();

    // muster reports the grant the prompt started: the write goes again.
    mockSignIn.isConnected = true;
    await userEvent.click(
      screen.getByRole('button', { name: /Continue with GitHub/ }),
    );
    expect(
      await screen.findByText('# toolchain-manager: helm-tools'),
    ).toBeInTheDocument();
    expect(mockClient.addPackages).toHaveBeenCalledTimes(2);
  });

  it("shows a failed build's log under its own heading, scrolling inside a cap", async () => {
    const log = 'ERROR: unable to select packages:\n  helmx (no such package)';
    mockClient.buildStatus.mockResolvedValue({
      build: {
        toolchain: 'helm-tools',
        source: 'agent-toolchains',
        repository: 'giantswarm/agent-toolchains',
        state: 'failed',
        pull: 7,
        jobs: [{ name: 'contract', state: 'failure' }],
        log,
      },
    });
    await renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /Name/ }),
      'helm-tools',
    );
    await userEvent.type(
      screen.getByRole('searchbox', { name: /Search packages/ }),
      'helm',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Write Dockerfile' }),
    );
    await screen.findByText('# toolchain-manager: helm-tools');
    act(() => {
      mockCreate.data = {
        created: {
          toolchain: 'helm-tools',
          source: 'agent-toolchains',
          repository: 'giantswarm/agent-toolchains',
          pull: 7,
          pullURL: 'https://github.com/giantswarm/agent-toolchains/pull/7',
          branch: 'toolchain/helm-tools',
        },
      };
      mockCreate.rerender();
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Log of the failed job',
        level: 3,
      }),
    ).toBeInTheDocument();
    const block = screen.getByText(/unable to select packages/, {
      selector: 'pre',
    });
    expect(block).toHaveTextContent('helmx (no such package)');
    expect(block.style.getPropertyValue('--code-block-max-height')).toBe(
      '520px',
    );
    // The Dockerfile is the one file on the page; the log is not one.
    const files = screen.getAllByTestId('file-view');
    expect(files).toHaveLength(1);
    expect(files[0]).toHaveAttribute('data-filename', 'Dockerfile');
    expect(files[0]).not.toContainElement(block);
  });

  it('drops a Dockerfile written for a name changed meanwhile', async () => {
    let answer: (value: unknown) => void = () => undefined;
    mockClient.addPackages.mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      }),
    );
    await renderPage();

    const nameField = screen.getByRole('textbox', { name: /Name/ });
    await userEvent.type(nameField, 'helm-tools');
    await userEvent.type(
      screen.getByRole('searchbox', { name: /Search packages/ }),
      'helm',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Write Dockerfile' }),
    );
    await userEvent.type(nameField, '-x');
    await act(async () =>
      answer({
        toolchain: 'helm-tools',
        path: 'toolchains/helm-tools/Dockerfile',
        dockerfile: '# toolchain-manager: helm-tools',
      }),
    );

    expect(
      screen.queryByText('# toolchain-manager: helm-tools'),
    ).not.toBeInTheDocument();
  });

  it('writes nothing without a name and a package, saying so', async () => {
    await renderPage();

    await userEvent.click(
      screen.getByRole('button', { name: 'Write Dockerfile' }),
    );

    expect(mockClient.addPackages).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Use lowercase letters, digits and dashes, e.g. helm-tools',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Add at least one package')).toBeInTheDocument();
  });
});

describe('buildPollInterval', () => {
  const query = (data: unknown) =>
    ({ state: { data } }) as Parameters<typeof buildPollInterval>[0];

  it('stops on a grant answer, and polls again once the build is read', () => {
    expect(
      buildPollInterval(
        query({ status: 'grant_required', apps: ['toolchain-manager'] }),
      ),
    ).toBe(false);
    expect(
      buildPollInterval(query({ build: { state: 'checking' } })),
    ).toBeGreaterThan(0);
    expect(buildPollInterval(query({ build: { state: 'published' } }))).toBe(
      false,
    );
    expect(buildPollInterval(query(undefined))).toBeGreaterThan(0);
  });
});
