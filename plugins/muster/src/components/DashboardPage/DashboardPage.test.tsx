import { ReactNode } from 'react';
import { act, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { identityApiRef } from '@backstage/core-plugin-api';
import { MusterApi, musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { DashboardPage } from './DashboardPage';

// The CRD reads behind the dashboard are somebody else's question here.
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: [],
    errors: [],
    queries: [],
    isLoading: false,
    retry: jest.fn(),
  }),
  useShowErrors: () => undefined,
}));

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

const identityApi = {
  getProfileInfo: async () => ({ displayName: 'Test Person' }),
  getBackstageIdentity: async () => ({
    type: 'user' as const,
    userEntityRef: 'user:default/test',
    ownershipEntityRefs: [],
  }),
  getCredentials: async () => ({}),
  signOut: async () => {},
};

function renderDashboard(api: Partial<MusterApi>, value: MusterInstance) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MusterInstanceContext.Provider value={value}>
        {children}
      </MusterInstanceContext.Provider>
    </QueryClientProvider>
  );
  return renderInTestApp(
    <Wrapper>
      <DashboardPage />
    </Wrapper>,
    {
      // The section root; the dashboard's tab links are sub routes of it.
      mountedRoutes: { '/agent-platform/muster': rootRouteRef },
      apis: [
        [musterApiRef, api as MusterApi],
        [identityApiRef, identityApi],
      ],
    },
  );
}

describe('DashboardPage on an installation the portal cannot reach', () => {
  it('says so, offers no connect and sends the tool-count probe nowhere', async () => {
    const api = {
      filterTools: jest.fn(),
      listServers: jest.fn(),
      listCoreTools: jest.fn(),
      signIn: jest.fn(),
    };

    await renderDashboard(api, instance());

    expect(await screen.findByText('Not reachable')).toBeInTheDocument();
    expect(
      screen.getByText(
        'muster on wombat is not reachable from this portal (no answer within 3000 ms).',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /^(connect|retry|sign in again)$/i,
      }),
    ).toBeNull();

    // Give a would-be probe or capability read every chance to fire: none may.
    await act(() => new Promise(resolve => setTimeout(resolve, 30)));
    expect(api.filterTools).not.toHaveBeenCalled();
    expect(api.listServers).not.toHaveBeenCalled();
    expect(api.listCoreTools).not.toHaveBeenCalled();
  });

  it('still probes a reachable installation for the tool count', async () => {
    const api = {
      filterTools: jest.fn().mockResolvedValue({
        total: 484,
        filtered_count: 1,
        truncated: true,
        tools: [],
      }),
      listServers: jest.fn().mockResolvedValue({ servers: [] }),
      listCoreTools: jest.fn().mockResolvedValue({ tools: [] }),
      signIn: jest.fn(),
    };

    await renderDashboard(
      api,
      instance({
        activeInstallation: 'gazelle',
        scope: 'gazelle',
        activeInstallationInfo: {
          name: 'gazelle',
          requiresAuth: true,
          reachable: true,
        },
      }),
    );

    expect(await screen.findByText('484')).toBeInTheDocument();
    expect(api.filterTools).toHaveBeenCalledWith({
      installation: 'gazelle',
      limit: 1,
    });
  });
});
