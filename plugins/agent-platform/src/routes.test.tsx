import { useRouteRef } from '@backstage/frontend-plugin-api';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import { agentPlatformPlugin } from './plugin';

const { routes } = agentPlatformPlugin;

function Probe() {
  const agentEdit = useRouteRef(routes.agentEdit);
  const modelEdit = useRouteRef(routes.modelEdit);
  const resolved = {
    agentEdit: agentEdit?.({
      installation: 'lab',
      namespace: 'kagent',
      name: 'helper',
    }),
    modelEdit: modelEdit?.({
      installation: 'lab',
      namespace: 'kagent',
      name: 'gpt',
    }),
    usage: useRouteRef(routes.usage)?.(),
    modelDetail: useRouteRef(routes.modelDetail)?.({
      installation: 'lab',
      namespace: 'kagent',
      name: 'gpt',
    }),
    serving: useRouteRef(routes.serving)?.(),
    gpuCapacity: useRouteRef(routes.gpuCapacity)?.(),
    modelCache: useRouteRef(routes.modelCache)?.(),
    usageCost: useRouteRef(routes.usageCost)?.(),
    usageConversations: useRouteRef(routes.usageConversations)?.(),
    usageConnectors: useRouteRef(routes.usageConnectors)?.(),
    serveModel: useRouteRef(routes.serveModel)?.(),
    importModel: useRouteRef(routes.importModel)?.(),
    pullModel: useRouteRef(routes.pullModel)?.(),
    addModelBackend: useRouteRef(routes.addModelBackend)?.(),
    addGpuNodePool: useRouteRef(routes.addGpuNodePool)?.(),
  };
  return <pre data-testid="resolved">{JSON.stringify(resolved)}</pre>;
}

describe('the exported route refs', () => {
  it('resolve to the paths the routes describe', async () => {
    await renderInTestApp(<Probe />, {
      mountedRoutes: {
        '/customize/agents': routes.agents,
        '/customize/models': routes.models,
        '/usage': routes.usage,
      },
    });

    expect(
      JSON.parse(screen.getByTestId('resolved').textContent ?? '{}'),
    ).toEqual({
      agentEdit: '/customize/agents/lab/kagent/helper/edit',
      modelEdit: '/customize/models/lab/kagent/gpt/edit',
      usage: '/usage',
      modelDetail: '/customize/models/lab/kagent/gpt',
      serving: '/customize/models/hosting',
      gpuCapacity: '/customize/models/hosting/capacity',
      modelCache: '/customize/models/hosting/cache',
      usageCost: '/usage/cost',
      usageConversations: '/usage/your-sessions',
      usageConnectors: '/usage/connectors',
      serveModel: '/customize/models/hosting/serve',
      importModel: '/customize/models/hosting/import',
      pullModel: '/customize/models/hosting/pull',
      addModelBackend: '/customize/models/hosting/add-backend',
      addGpuNodePool: '/customize/models/hosting/capacity/add-pool',
    });
  });
});
