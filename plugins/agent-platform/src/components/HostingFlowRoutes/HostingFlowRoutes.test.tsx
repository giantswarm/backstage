import { Route, Routes, useLocation } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import type { NodePoolWriteResult } from '../../lib/clusterManager';
import type { ModelManagerLoadAnswer } from '../../lib/modelManager';
import { modelsRouteRef } from '../../routes';
import { AddGpuNodePoolRoute, ServeModelRoute } from './HostingFlowRoutes';

const mockToastPost = jest.fn();
jest.mock('@backstage/frontend-plugin-api', () => {
  const actual = jest.requireActual('@backstage/frontend-plugin-api');
  return {
    ...actual,
    useApi: (ref: unknown) =>
      ref === actual.toastApiRef ? { post: mockToastPost } : actual.useApi(ref),
  };
});

let mockServing = {
  isLoading: false,
  servedModels: [],
  reachableInstallations: ['inst-1'],
};
jest.mock('../ServingProvider', () => ({
  useServing: () => mockServing,
}));

const pool = { name: 'inst-1', backend: 'kserve', capabilities: {} };
let mockLoadTargets: (typeof pool)[] = [pool];
jest.mock('../ServingPage', () => ({
  OPENED_SERVED_MODEL_KEY: 'openedServedModel',
  useServingTargets: () => ({ loadTargets: mockLoadTargets }),
}));

// Which installations withhold cluster-manager and model-manager for want of
// a per-user sign-in; none unless a case says so.
let mockSharedIdentity: { clusterManager: string[]; modelManager: string[] } = {
  clusterManager: [],
  modelManager: [],
};
jest.mock('../ModelHostingSharedIdentity', () => ({
  ...jest.requireActual('../ModelHostingSharedIdentity'),
  useModelHostingSharedIdentity: () => mockSharedIdentity,
}));

let mockPoolInstallations: string[] = ['inst-1'];
jest.mock('../../hooks/useClusterManager', () => ({
  useClusterManagerAvailability: () => ({
    available: mockPoolInstallations,
    isLoading: false,
  }),
}));

const mockRecord = jest.fn();
const mockRemove = jest.fn();
jest.mock('../../hooks/useServeIntents', () => ({
  useServeIntents: () => ({ record: mockRecord, remove: mockRemove }),
}));

const LOADED: ModelManagerLoadAnswer = {
  name: 'qwen3-8b-fp8',
  running: { resource: 'qwen3-8b-fp8-a1' },
} as ModelManagerLoadAnswer;

// The flows themselves are tested on their own; here it is about what their
// routes hand them and where an outcome leads.
jest.mock('../ModelManagerControls', () => ({
  describeLoadTarget: (target: { name: string }) => target.name,
  ServeModelPage: ({
    seed,
    closeHref,
    onServed,
  }: {
    seed?: { installation?: string; pool?: string; model?: string };
    closeHref: string;
    onServed: (target: unknown, answer: ModelManagerLoadAnswer) => void;
  }) => (
    <div>
      <p>
        Serve on {seed?.installation}/{seed?.pool} {seed?.model}, back to{' '}
        {closeHref}
      </p>
      <button type="button" onClick={() => onServed(pool, LOADED)}>
        Serve
      </button>
    </div>
  ),
  ImportModelPage: () => null,
  PullModelPage: () => null,
}));

const DEPLOYED = {
  cluster: 'wc1',
  pool: 'gpu-l4',
  objects: [],
} as unknown as NodePoolWriteResult;

jest.mock('../GpuNodePools', () => ({
  ...jest.requireActual('../GpuNodePools/GpuNodePoolControls'),
  AddGpuNodePoolPage: ({
    installations,
    onDeployed,
  }: {
    installations: string[];
    onDeployed: (
      result: NodePoolWriteResult,
      installation: string,
      serve?: { preset: string },
    ) => void;
  }) => (
    <div>
      <p>Pool on {installations.join(',')}</p>
      <button
        type="button"
        onClick={() =>
          onDeployed(DEPLOYED, 'inst-1', { preset: 'qwen3-8b-fp8' })
        }
      >
        Deploy
      </button>
    </div>
  ),
}));

jest.mock('../ModelBackends', () => ({
  AddModelBackendPage: () => null,
  useModelBackendTargets: () => ({}),
}));

/** Where an outcome lands: the view's path and what it is handed. */
const Landing = () => {
  const { pathname, state } = useLocation();
  return (
    <p data-testid="landing">
      {pathname} {JSON.stringify(state)}
    </p>
  );
};

function renderAt(path: string, element: JSX.Element) {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <Routes>
        <Route path={path} element={element} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </PageHeaderActionsProvider>,
    {
      mountedRoutes: { '/customize/models': modelsRouteRef },
      initialRouteEntries: [
        `${path}?installation=inst-1&cluster=wc1&pool=gpu-l4&preset=qwen3-8b-fp8`,
      ],
    },
  );
}

beforeEach(() => {
  mockSharedIdentity = { clusterManager: [], modelManager: [] };
  jest.clearAllMocks();
  mockServing = {
    isLoading: false,
    servedModels: [],
    reachableInstallations: ['inst-1'],
  };
  mockLoadTargets = [pool];
  mockPoolInstallations = ['inst-1'];
});

describe('ServeModelRoute', () => {
  const path = '/customize/models/hosting/serve';

  it('seeds the page from the query and returns to the Serving view by default', async () => {
    await renderAt(path, <ServeModelRoute />);

    expect(
      screen.getByText(
        'Serve on inst-1/gpu-l4 qwen3-8b-fp8, back to /customize/models/hosting',
      ),
    ).toBeInTheDocument();
  });

  it('after the load, toasts and lands on the Serving view opened on the served model', async () => {
    await renderAt(path, <ServeModelRoute />);

    await userEvent.click(screen.getByRole('button', { name: 'Serve' }));

    expect(mockToastPost).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Serving "qwen3-8b-fp8" on inst-1',
        status: 'success',
      }),
    );
    expect(screen.getByTestId('landing')).toHaveTextContent(
      '/customize/models/hosting {"openedServedModel":{"installation":"inst-1","name":"qwen3-8b-fp8-a1"}}',
    );
  });

  it('says so, in the flow’s frame, where nothing can serve', async () => {
    mockLoadTargets = [];
    await renderAt(path, <ServeModelRoute />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Serve model' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No backend can serve a model yet. Add a model backend or a GPU node pool first.',
      ),
    ).toBeInTheDocument();
  });
});

describe('AddGpuNodePoolRoute', () => {
  const path = '/customize/models/hosting/capacity/add-pool';

  it('records the preset to serve and lands on GPU pools, opened on the pool', async () => {
    await renderAt(path, <AddGpuNodePoolRoute />);
    expect(screen.getByText('Pool on inst-1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Deploy' }));

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inst-1/wc1/wc1-gpu-l4' }),
      { preset: 'qwen3-8b-fp8' },
    );
    const landing = screen.getByTestId('landing');
    expect(landing).toHaveTextContent('/customize/models/hosting/capacity');
    expect(landing).toHaveTextContent(
      '"openedPool":{"id":"inst-1/wc1/wc1-gpu-l4","installation":"inst-1","cluster":"wc1","poolName":"gpu-l4"',
    );
  });

  it('says so where no environment runs cluster-manager', async () => {
    mockPoolInstallations = [];
    await renderAt(path, <AddGpuNodePoolRoute />);

    expect(
      screen.getByText(
        'No environment in reach runs cluster-manager, so no GPU node pool can be added.',
      ),
    ).toBeInTheDocument();
  });

  it('says why where cluster-manager runs only behind a muster without per-user sign-in', async () => {
    mockPoolInstallations = [];
    mockSharedIdentity = { clusterManager: ['inst-2'], modelManager: [] };
    await renderAt(path, <AddGpuNodePoolRoute />);

    expect(
      screen.getByText(
        /GPU node pools are managed through cluster-manager as you, and muster on inst-2 has no per-user sign-in in this portal/,
      ),
    ).toBeInTheDocument();
  });
});
