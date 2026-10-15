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
    usageOverview: useRouteRef(routes.usageOverview)?.(),
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
        '/agent-platform/agents': routes.agents,
        '/agent-platform/models': routes.models,
        '/agent-platform/usage': routes.usage,
      },
    });

    expect(
      JSON.parse(screen.getByTestId('resolved').textContent ?? '{}'),
    ).toEqual({
      agentEdit: '/agent-platform/agents/edit/lab/kagent/helper',
      modelEdit: '/agent-platform/models/edit/lab/kagent/gpt',
      usageOverview: '/agent-platform/usage/overview',
      usageCost: '/agent-platform/usage/cost',
      usageConversations: '/agent-platform/usage/conversations',
      usageConnectors: '/agent-platform/usage/connectors',
      serveModel: '/agent-platform/models/serving/serve',
      importModel: '/agent-platform/models/serving/import',
      pullModel: '/agent-platform/models/serving/pull',
      addModelBackend: '/agent-platform/models/serving/add-backend',
      addGpuNodePool: '/agent-platform/models/capacity/add-pool',
    });
  });
});
