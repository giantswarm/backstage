import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { CreateToolchainResult } from '../../lib/toolchainManager';
import { toolchainsRouteRef } from '../../routes';
import { NewToolchainPage } from './NewToolchainPage';

const mockClient = {
  searchPackages: jest.fn(),
  addPackages: jest.fn(),
  buildStatus: jest.fn(),
};
jest.mock('../../hooks/useToolchainManager', () => ({
  useScopedToolchainInstallations: () => ({
    installations: ['gazelle'],
    hasToolchains: true,
  }),
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
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  FileView: (props: { content: string }) => <pre>{props.content}</pre>,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <NewToolchainPage />
    </QueryClientProvider>,
    { mountedRoutes: { '/customize/toolchains': toolchainsRouteRef } },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
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
      await screen.findByText('Log of the failed job'),
    ).toBeInTheDocument();
    const block = screen.getByText(/unable to select packages/, {
      selector: 'pre',
    });
    expect(block).toHaveTextContent('helmx (no such package)');
    expect(block).toHaveStyle({ maxHeight: '520px' });
    expect(screen.queryByText('Failed job')).not.toBeInTheDocument();
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
