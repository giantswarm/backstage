import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef } from '../../apis';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { ToolExplorerPage } from './ToolExplorerPage';

const NOTE =
  'muster on wombat is not reachable from this portal (no answer within 3000 ms).';

function instance(overrides: Partial<MusterInstance> = {}): MusterInstance {
  const installationInfos = [
    { name: 'gazelle', requiresAuth: true, reachable: true as const },
    {
      name: 'wombat',
      requiresAuth: true,
      reachable: false as const,
      reason: 'no answer within 3000 ms',
    },
  ];
  return {
    installations: ['gazelle', 'wombat'],
    installationInfos,
    isLoadingInstallations: false,
    activeInstallation: 'wombat',
    scope: 'wombat',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: installationInfos[1],
    setActiveInstallation: jest.fn(),
    mcpServers: [],
    workflows: [],
    isLoading: false,
    dataUpdatedAt: undefined,
    isRefreshing: false,
    retry: jest.fn(),
    ...overrides,
  };
}

function renderPage(api: Partial<MusterApi>, value: MusterInstance) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, api as MusterApi]]}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MusterInstanceContext.Provider value={value}>
            {children}
          </MusterInstanceContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </TestApiProvider>
  );
  return render(<ToolExplorerPage />, { wrapper });
}

describe('ToolExplorerPage on an installation the portal cannot reach', () => {
  it('says so instead of the explorer, offers no connect and sends nothing', async () => {
    const api = {
      filterTools: jest.fn(),
      listTools: jest.fn(),
      signIn: jest.fn(),
    };

    renderPage(api, instance());

    expect(
      screen.getByText(`Tools are read through a live muster session. ${NOTE}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /connect|retry|sign in/i }),
    ).toBeNull();
    expect(screen.queryByText(/Select a tool to view its schema/)).toBeNull();

    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
    expect(api.filterTools).not.toHaveBeenCalled();
    expect(api.listTools).not.toHaveBeenCalled();
  });
});
