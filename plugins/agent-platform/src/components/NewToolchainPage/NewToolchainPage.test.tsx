import { screen } from '@testing-library/react';
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
    data: [
      {
        name: 'agent-toolchains',
        repository: 'giantswarm/agent-toolchains',
        offered: true,
      },
    ],
  }),
}));
const mockCreate = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null as Error | null,
  data: undefined as CreateToolchainResult | undefined,
};
jest.mock('../../hooks/useToolchainWrites', () => ({
  useCreateToolchain: () => mockCreate,
}));
jest.mock('../CodeBlock', () => ({
  CodeBlock: (props: { content: string }) => <pre>{props.content}</pre>,
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
