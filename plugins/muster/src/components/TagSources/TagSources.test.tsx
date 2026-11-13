import { render, waitFor } from '@testing-library/react';

import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { ConnectorTagSource, WorkflowTagSource } from './TagSources';

let mockResources: unknown[] = [];
const mockUseMusterResources = jest.fn();

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('../MusterInstanceProvider/useMusterInstallations', () => ({
  useMusterInstallations: () => ({
    installations: [{ name: 'gazelle' }, { name: 'golem' }],
  }),
}));
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationInventory: () => ({
    entries: [],
    installationsWith: () => [],
  }),
}));
jest.mock('../MusterInstanceProvider/useMusterResources', () => ({
  useMusterResources: (...args: unknown[]) => {
    mockUseMusterResources(...args);
    return { resources: mockResources, isLoading: false };
  },
}));

function server(
  name: string,
  tags: string,
  family?: string,
  toolGroup?: string,
) {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        namespace: 'muster',
        annotations: { 'ui.giantswarm.io/tags': tags },
        ...(toolGroup
          ? {
              labels: {
                'agent-platform.giantswarm.io/tool-group': toolGroup,
              },
            }
          : {}),
      },
      spec: family ? { family: { name: family } } : {},
    } as never,
    'gazelle',
  );
}

describe('ConnectorTagSource', () => {
  it('reports one entry per connector on every muster installation', async () => {
    mockResources = [
      server('walrus-k8s', 'kubernetes', 'k8s', 'infrastructure'),
      server('gazelle-k8s', 'kubernetes,ops', 'k8s', 'infrastructure'),
      server('jira', 'ticketing'),
    ];
    const onTags = jest.fn();
    render(<ConnectorTagSource onTags={onTags} />);

    await waitFor(() =>
      expect(onTags).toHaveBeenCalledWith([
        ['kubernetes', 'ops'],
        ['ticketing'],
      ]),
    );
    // Not the read-only tool-group tag: nobody types `infrastructure` onto
    // a connector, so it is never suggested.
    expect(onTags).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.arrayContaining(['infrastructure'])]),
    );
    // A mount on the next page reuses the list for a while.
    expect(mockUseMusterResources).toHaveBeenCalledWith(
      ['gazelle', 'golem'],
      MCPServer,
      { staleTime: 5 * 60_000 },
    );
  });
});

describe('WorkflowTagSource', () => {
  it('reports each workflow’s tags', async () => {
    mockResources = [
      new MusterWorkflow(
        {
          apiVersion: 'muster.giantswarm.io/v1alpha1',
          kind: 'Workflow',
          metadata: {
            name: 'deploy',
            annotations: { 'ui.giantswarm.io/tags': 'release' },
          },
        } as never,
        'gazelle',
      ),
    ];
    const onTags = jest.fn();
    render(<WorkflowTagSource onTags={onTags} />);

    await waitFor(() => expect(onTags).toHaveBeenCalledWith([['release']]));
    expect(mockUseMusterResources).toHaveBeenCalledWith(
      expect.anything(),
      MusterWorkflow,
      { staleTime: 5 * 60_000 },
    );
  });
});
