import { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef } from '../../apis';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { McpUsageSection } from './McpUsageSection';

// The section brings its own MusterProviders so it can be mounted anywhere;
// passed through here so these tests keep injecting MusterInstanceContext
// directly rather than standing up the real provider stack.
jest.mock('../MusterProviders', () => ({
  MusterProviders: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

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

describe('McpUsageSection on an installation the portal cannot reach', () => {
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

    render(<McpUsageSection />, { wrapper });

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

  it('renders neither an installation picker nor a time-range control', async () => {
    // Both went when this moved onto the shared Usage page: the page header
    // already carries the section's installation scope, and one section's own
    // window control would make the page's stated window false for the other.
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

    render(<McpUsageSection />, { wrapper });

    expect(screen.queryByRole('group', { name: /time range/i })).toBeNull();
    for (const label of ['24h', '7d', '30d']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
    expect(screen.queryByRole('combobox')).toBeNull();

    // And the heading says whose numbers these are, which is what keeps it from
    // being read as the personal section above it.
    expect(
      screen.getByText('MCP tool calls on this installation'),
    ).toBeInTheDocument();

    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
  });
});
