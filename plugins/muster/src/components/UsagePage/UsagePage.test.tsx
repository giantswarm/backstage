import { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef } from '../../apis';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { UsagePage } from './UsagePage';

const NOTE =
  'muster on wombat is not reachable from this portal (no answer within 3000 ms).';

function instance(): MusterInstance {
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
  };
}

describe('UsagePage on an installation the portal cannot reach', () => {
  it('says so instead of the metrics, offers no connect and asks the backend nothing', async () => {
    const api = {
      getMcpUsage: jest.fn(),
      filterTools: jest.fn(),
      signIn: jest.fn(),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
        <QueryClientProvider client={queryClient}>
          <MusterInstanceContext.Provider value={instance()}>
            {children}
          </MusterInstanceContext.Provider>
        </QueryClientProvider>
      </TestApiProvider>
    );

    render(<UsagePage />, { wrapper });

    expect(
      screen.getByText(
        `Usage metrics are read through a live muster session. ${NOTE}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /connect|retry|sign in/i }),
    ).toBeNull();
    expect(screen.queryByText(/Usage unavailable/)).toBeNull();

    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
    expect(api.getMcpUsage).not.toHaveBeenCalled();
    expect(api.filterTools).not.toHaveBeenCalled();
  });
});
