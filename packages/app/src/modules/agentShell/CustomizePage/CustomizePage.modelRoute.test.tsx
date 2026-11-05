import { createApiRef } from '@backstage/frontend-plugin-api';
import {
  createExtensionTester,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import { ConfigReader } from '@backstage/config';
import {
  __resetSignedInConfigForTests,
  setSignedInConfig,
} from '@giantswarm/backstage-plugin-gs-react';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import userEvent from '@testing-library/user-event';
import { Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import {
  clusterAccessStatusApiRef,
  mutedInstallationsApiRef,
} from '@giantswarm/backstage-plugin-gs';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { CustomizePage } from './CustomizePage';

/**
 * One model's page through the app's real Customize route and the real
 * Models tab agent-platform attaches to it (`sub-page:agent-platform/models`,
 * whose router now holds the page), with everything it renders (GitOpsCard
 * included): only the data is stubbed, never a provider or a component. A
 * provider the page needs and the route does not mount fails here, as it
 * would in the portal.
 */

// A ModelConfig a Flux HelmRelease applies, as the lab's default one is, so
// the Technical details fold-out renders the GitOps card.
const modelConfig = new ModelConfig(
  {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: {
      name: 'default-model-config',
      namespace: 'kagent',
      generation: 1,
      labels: {
        'helm.toolkit.fluxcd.io/name': 'kagent',
        'helm.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
      },
    },
    spec: {
      provider: 'OpenAI',
      model: 'gpt-4o',
      apiKeySecret: 'kagent-openai',
    },
    status: {
      observedGeneration: 1,
      conditions: [
        {
          type: 'Accepted',
          status: 'False',
          reason: 'SecretNotFound',
          message: 'Secret kagent/kagent-openai not found',
          lastTransitionTime: '2026-10-01T10:00:00Z',
        },
      ],
    },
  } as ModelConfigInterface,
  'grizzly',
);

const emptyList = {
  resources: [],
  clustersData: [],
  isLoading: false,
  errors: [],
};

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => {
  const actual = jest.requireActual(
    '@giantswarm/backstage-plugin-kubernetes-react',
  );
  return {
    ...actual,
    // The ModelConfig, read alone (its page) or listed (the list); every
    // other read finds nothing, the GitOps card's Flux lookups included.
    useResource: (_installation: string, kind: { kind?: string }) => ({
      resource: kind?.kind === 'ModelConfig' ? modelConfig : undefined,
      isLoading: false,
      errors: [],
      incompatibilities: [],
    }),
    useResources: (_installations: unknown, kind: { kind?: string }) =>
      kind?.kind === 'ModelConfig'
        ? {
            ...emptyList,
            resources: [modelConfig],
            clustersData: [{ cluster: 'grizzly', status: 'success' }],
          }
        : emptyList,
    useSelfSubjectAccessReview: () => ({ allowed: true, isLoading: false }),
  };
});

// One installation running kagent, its inventory read. The installations
// config itself is the real store, seeded below, as gs reads it internally
// too (whether Mimir runs there, say).
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useInstallationInventory: () => ({
    entries: [],
    home: 'grizzly',
    isLoading: false,
    isProbing: false,
    installationsWith: (component: string) =>
      component === 'kagent' ? ['grizzly'] : [],
    refresh: () => {},
  }),
  useInstallationScope: () => ({
    scope: 'all',
    setScope: () => {},
    home: 'grizzly',
    isSingleInstallation: true,
    isLoading: false,
  }),
}));

// The Customize screen's muster tabs are not under test.
jest.mock('@giantswarm/backstage-plugin-muster', () => {
  const actual = jest.requireActual('@giantswarm/backstage-plugin-muster');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    CustomizeMusterProvider: ({ children }: { children: ReactNode }) =>
      children,
    useMusterCustomizeCounts: () => ({}),
    CustomizeConnectorsPanel: () => null,
    CustomizeWorkflowsPanel: () => null,
  };
});

// No installation switched off in the Cluster access widget.
const mutedInstallationsApi = {
  isMuted: () => false,
  getSnapshot: () => [],
  muted$: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
};

// Every installation reachable: no access probe has reported otherwise.
const clusterAccessStatusApi = {
  getSnapshot: () => [],
  status$: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
};

// Any request the stubbed hooks above do not answer finds nothing.
const kubernetesApi = {
  proxy: async () => new Response('{}', { status: 404 }),
  getClusters: async () => [],
  getCluster: async () => ({ name: 'grizzly', authProvider: 'oidc' }),
};

// The gateway's metrics: every instant query answers $12.50 of calls to the
// model by one agent, every range query one day of it.
const sample = {
  agent_namespace: 'kagent',
  agent: 'triage',
  gen_ai_response_model: 'gpt-4o',
  gen_ai_token_type: 'input',
};
const mimirApi = {
  query: async () => ({
    status: 'success',
    data: {
      resultType: 'vector',
      result: [{ metric: sample, value: [1760000000, '12.5'] }],
    },
  }),
  queryRange: async () => ({
    status: 'success',
    data: {
      resultType: 'matrix',
      result: [{ metric: sample, values: [[1760000000, '12.5']] }],
    },
  }),
};
const kubernetesAuthProvidersApi = {
  getCredentials: async () => ({ token: 'token' }),
};

// agent-platform's own APIs, which its plugin registers in the app and keeps
// private: a ref with the same id reaches the same slot. No installation runs
// model-manager here, so nothing calls them.
const modelManagerApiRef = createApiRef<object>({
  id: 'plugin.agent-platform.model-manager',
});
const kagentApiRef = createApiRef<object>({
  id: 'plugin.agent-platform.kagent',
});
// gs's Mimir client, private the same way.
const mimirApiRef = createApiRef<object>({ id: 'plugin.gs.mimir' });

function renderAt(path: string) {
  const modelsTab = createExtensionTester(
    agentPlatformPlugin.getExtension('sub-page:agent-platform/models'),
  ).reactElement();
  return renderInTestApp(
    <Routes>
      <Route
        path="/customize/*"
        element={
          // The boundary the app's page extension renders the page in.
          <Suspense fallback={<p>Loading</p>}>
            <CustomizePage pages={[{ path: 'models', element: modelsTab }]} />
          </Suspense>
        }
      />
    </Routes>,
    {
      // The app binds agent-platform's `customize` route to its Customize
      // page, and the Models tab resolves under it; mounting both here
      // stands for that.
      mountedRoutes: {
        '/customize': agentPlatformPlugin.externalRoutes.customize,
        '/customize/models': agentPlatformPlugin.routes.models,
      },
      initialRouteEntries: [path],
      apis: [
        [clusterAccessStatusApiRef, clusterAccessStatusApi as never],
        [kubernetesApiRef, kubernetesApi as never],
        [modelManagerApiRef, {}],
        [musterApiRef, {}],
        [kagentApiRef, {}],
        // The gateway's figures: a query that cannot run reads as unavailable.
        [mimirApiRef, mimirApi],
        [kubernetesAuthProvidersApiRef, kubernetesAuthProvidersApi as never],
        [mutedInstallationsApiRef, mutedInstallationsApi as never],
      ],
    },
  );
}

/**
 * Waits for the model page to settle and returns what it shows: its title,
 * whether Overview says why the model is not accepted (in the controller's
 * words), whether Technical details is open at its foot (the model is not
 * accepted, so it opens on arrival, GitOps card and all), and
 * whether the gateway figure is on the Usage tab after the reads settled (it
 * must not drop away).
 */
async function settledModelPage() {
  const heading = await screen.findByRole('heading', {
    level: 1,
    name: 'default-model-config',
  });
  await waitFor(() =>
    expect(screen.queryByText(/^Reading/)).not.toBeInTheDocument(),
  );
  const reason =
    (await screen.findAllByText('Secret kagent/kagent-openai not found'))
      .length > 0;

  const technicalDetails = (
    await screen.findByRole('button', { name: 'Technical details' })
  ).getAttribute('aria-expanded');

  await userEvent.click(screen.getByRole('tab', { name: 'Usage' }));
  await screen.findByText('$12.50');
  // A further tick: nothing replaced the figures once the reads settled.
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    title: heading.textContent,
    spend: screen.queryByText('$12.50') !== null,
    technicalDetails,
    reason,
  };
}

const SETTLED = {
  title: 'default-model-config',
  spend: true,
  technicalDetails: 'true',
  reason: true,
};

describe('CustomizePage: one model through the app route', () => {
  beforeEach(() => {
    setSignedInConfig(
      new ConfigReader({ gs: { installations: { grizzly: {} } } }),
    );
  });
  afterEach(() => __resetSignedInConfigForTests());

  it('renders the page on a direct load', async () => {
    await renderAt('/customize/models/grizzly/kagent/default-model-config');
    expect(await settledModelPage()).toEqual(SETTLED);
  });

  it('renders the page on a navigation from the list', async () => {
    await renderAt('/customize/models');

    await userEvent.click(
      await screen.findByRole('link', { name: 'default-model-config' }),
    );

    expect(await settledModelPage()).toEqual(SETTLED);
  });
});
