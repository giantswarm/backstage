import { renderInTestApp } from '@backstage/frontend-test-utils';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin from '@giantswarm/backstage-plugin-muster';
import { screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CustomizePage } from './CustomizePage';

const mockServingLayer = jest.fn(() => true);

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef, createSubRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  const agents = createRouteRef();
  const models = createRouteRef();
  return {
    ServingLayerGate: ({ children }: { children: ReactNode }) =>
      mockServingLayer() ? children : null,
    agentPlatformPlugin: {
      routes: {
        agents,
        newAgent: createSubRouteRef({ path: '/new', parent: agents }),
        models,
        newModel: createSubRouteRef({ path: '/new', parent: models }),
        serving: createSubRouteRef({ path: '/serving', parent: models }),
      },
    },
  };
});

jest.mock('@giantswarm/backstage-plugin-muster', () => {
  const { createRouteRef, createSubRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  const mcpServers = createRouteRef();
  return {
    __esModule: true,
    default: {
      routes: {
        mcpServers,
        newMcpServer: createSubRouteRef({ path: '/new', parent: mcpServers }),
        workflows: createRouteRef(),
      },
    },
  };
});

const allRoutes = {
  '/agent-platform/agents': agentPlatformPlugin.routes.agents,
  '/agent-platform/models': agentPlatformPlugin.routes.models,
  '/agent-platform/mcp-servers': musterPlugin.routes.mcpServers,
  '/agent-platform/workflows': musterPlugin.routes.workflows,
};

function cards() {
  return screen.getAllByRole('heading', { level: 2 }).map(heading => {
    const card = heading.closest('.bui-Card') as HTMLElement;
    return {
      title: heading.textContent,
      href: within(heading).getByRole('link').getAttribute('href'),
      create: within(card)
        .queryAllByRole('link')
        .filter(link => !heading.contains(link))
        .map(link => [link.textContent, link.getAttribute('href')]),
    };
  });
}

describe('CustomizePage', () => {
  beforeEach(() => mockServingLayer.mockReturnValue(true));

  it('renders a card per area with its link and create action', async () => {
    await renderInTestApp(<CustomizePage />, { mountedRoutes: allRoutes });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Customize' }),
    ).toBeInTheDocument();
    expect(cards()).toEqual([
      {
        title: 'Agents',
        href: '/agent-platform/agents',
        create: [['New agent', '/agent-platform/agents/new']],
      },
      {
        title: 'Models',
        href: '/agent-platform/models',
        create: [['Add model', '/agent-platform/models/new']],
      },
      {
        title: 'Model hosting',
        href: '/agent-platform/models/serving',
        create: [],
      },
      {
        title: 'MCP servers',
        href: '/agent-platform/mcp-servers',
        create: [['Register server', '/agent-platform/mcp-servers/new']],
      },
      {
        title: 'Workflows',
        href: '/agent-platform/workflows',
        create: [],
      },
    ]);
  });

  it('leaves out the cards whose route is not bound', async () => {
    await renderInTestApp(<CustomizePage />, {
      mountedRoutes: {
        '/agent-platform/agents': agentPlatformPlugin.routes.agents,
        '/agent-platform/workflows': musterPlugin.routes.workflows,
      },
    });

    expect(cards().map(card => card.title)).toEqual(['Agents', 'Workflows']);
  });

  it('leaves out Model hosting where no installation has a serving layer', async () => {
    mockServingLayer.mockReturnValue(false);
    await renderInTestApp(<CustomizePage />, { mountedRoutes: allRoutes });

    expect(cards().map(card => card.title)).toEqual([
      'Agents',
      'Models',
      'MCP servers',
      'Workflows',
    ]);
  });

  it('names itself in the document title', async () => {
    await renderInTestApp(<CustomizePage />, {
      mountedRoutes: allRoutes,
      config: { app: { title: 'Dev Portal' } },
    });

    await waitFor(() => expect(document.title).toBe('Customize | Dev Portal'));
  });
});
