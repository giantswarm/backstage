import {
  createFrontendPlugin,
  FeatureFlagState,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import { screen } from '@testing-library/react';

import { musterPlugin } from './plugin';

// The redirect's own loader, stubbed: what is under test is whether the app
// routes the old address at all.
const redirectPage = musterPlugin
  .getExtension('page:muster/mcp-servers-redirect')
  .override({
    params: {
      path: '/agent-platform/mcp-servers',
      noHeader: true,
      loader: async () => <div>Redirect content</div>,
    },
  });

function renderRedirect(agentShell: FeatureFlagState) {
  return renderTestApp({
    features: [
      createFrontendPlugin({ pluginId: 'muster', extensions: [redirectPage] }),
    ],
    initialRouteEntries: ['/agent-platform/mcp-servers/kubernetes'],
    apis: [
      mockApis.featureFlags({
        initialStates: { [AGENT_SHELL_FLAG]: agentShell },
      }),
    ],
  });
}

describe('the old MCP Servers address', () => {
  it('is routed in the agent shell', async () => {
    renderRedirect(FeatureFlagState.Active);

    expect(await screen.findByText('Redirect content')).toBeInTheDocument();
  });

  it('is not routed without the shell: the classic portal has no Agent Platform', async () => {
    renderRedirect(FeatureFlagState.None);

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByText('Redirect content')).not.toBeInTheDocument();
  });
});
