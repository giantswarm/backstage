import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Agent,
  RemoteMCPServer,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { CopyFromAgent } from './CopyFromAgent';

// The installation's Agents and their carrier RemoteMCPServers, stubbed per
// resource class; the real classes build the fixtures so the toolset is read
// the way the step reads it.
const mockUseResources = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

/** `count` agents, each declaring a toolset on its carrier; every tenth in `team-b`. */
function fleet(count: number) {
  const agents: Agent[] = [];
  const carriers: RemoteMCPServer[] = [];
  for (let i = 0; i < count; i++) {
    const name = `agent-${String(i).padStart(3, '0')}`;
    const namespace = i % 10 === 0 ? 'team-b' : 'kagent';
    carriers.push(
      new RemoteMCPServer(
        {
          apiVersion: 'api.kagent.dev/v1alpha3',
          kind: 'RemoteMCPServer',
          metadata: { name, namespace },
          spec: {
            description: 'gateway',
            url: 'http://muster.agent-platform.svc.cluster.local:8090/mcp',
            headersFrom: [
              { name: 'X-Muster-Toolset', value: 'preset:read-only' },
            ],
          },
        } as never,
        'gazelle',
      ),
    );
    agents.push(
      new Agent(
        {
          apiVersion: 'api.kagent.dev/v1alpha3',
          kind: 'Agent',
          metadata: {
            name,
            namespace,
            annotations: {
              'ui.giantswarm.io/display-name': `Agent ${String(i).padStart(
                3,
                '0',
              )}`,
            },
          },
          spec: {
            harnessRef: { name: 'kagent' },
            template: {
              modelConfig: { name: 'opus' },
              tools: [{ mcp: { server: { kind: 'RemoteMCPServer', name } } }],
            },
          },
        } as never,
        'gazelle',
      ),
    );
  }
  mockUseResources.mockImplementation(
    (_clusters: string[], ResourceClass: unknown) => ({
      resources: ResourceClass === Agent ? agents : carriers,
      isLoading: false,
      errors: [],
    }),
  );
}

const renderCopy = () =>
  renderInTestApp(
    <CopyFromAgent installation="gazelle" current={[]} onCopy={jest.fn()} />,
  );

const sourceCards = () => screen.getAllByRole('radio');

describe('CopyFromAgent', () => {
  it('offers three agents with no search and no reveal control', async () => {
    fleet(3);
    await renderCopy();

    expect(sourceCards()).toHaveLength(3);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
    expect(screen.queryByText(/shown/)).toBeNull();
  });

  it('offers 12 of 300 agents, a page more per click, and a search', async () => {
    fleet(300);
    await renderCopy();

    expect(sourceCards()).toHaveLength(12);
    expect(
      screen.getByRole('searchbox', { name: 'Search agents' }),
    ).toBeVisible();
    expect(screen.getByText('12 agents shown, 288 more')).toBeVisible();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 12 more agents' }),
    );
    expect(sourceCards()).toHaveLength(24);
  });

  it('searches by namespace and starts the matches over at the first page', async () => {
    fleet(300);
    await renderCopy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 12 more agents' }),
    );
    expect(sourceCards()).toHaveLength(24);

    // Every tenth agent is in team-b: 30 matches, back to a first page of 12.
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search agents' }),
      'team-b',
    );
    expect(sourceCards()).toHaveLength(12);
    expect(screen.getByText('12 agents shown, 18 more')).toBeVisible();
  });

  it('searches by name, and says so when nothing matches', async () => {
    fleet(300);
    await renderCopy();
    const search = screen.getByRole('searchbox', { name: 'Search agents' });

    await userEvent.type(search, 'agent-042');
    expect(sourceCards()).toHaveLength(1);
    expect(
      screen.getByRole('radio', { name: 'Copy the toolset of Agent 042' }),
    ).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, 'nobody');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('No agent matches “nobody”.')).toBeVisible();
  });
});
