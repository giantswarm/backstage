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
import { McpDashboard } from './McpDashboard';

// The dashboard brings its own MusterProviders so it can be mounted on the
// Agent Platform's Dashboards tab; passed through here so these tests keep
// injecting MusterInstanceContext directly rather than standing up the real
// provider stack.
jest.mock('../MusterProviders', () => ({
  MusterProviders: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// The tool-call section is its own unit (see UsageSection.test.tsx); stubbing it
// keeps the metrics read out of these tests, which are about the inventory half.
jest.mock('./UsageSection', () => ({
  UsageSection: () => <h3>Tool calls</h3>,
}));

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
      <McpDashboard />
    </Wrapper>,
    {
      // The dashboard itself resolves no route refs any more — the `Browse`
      // cards that did are gone — but muster's section root is still what any
      // future link here would resolve against, and mounting it costs nothing.
      mountedRoutes: { '/agent-platform/muster': rootRouteRef },
      apis: [
        [musterApiRef, api as MusterApi],
        [identityApiRef, identityApi],
      ],
    },
  );
}

describe('McpDashboard on an installation the portal cannot reach', () => {
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
