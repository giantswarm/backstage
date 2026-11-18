import { render, waitFor } from '@testing-library/react';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import { AgentTagSource, SkillTagSource } from './TagSources';

const mockUseResources = jest.fn();

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationInventory: () => ({
    installationsWith: () => ['gazelle', 'golem'],
  }),
}));
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));
jest.mock('../../hooks/useNamespacedResources', () => ({
  useNamespacedFallback: (base: unknown) => base,
}));
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({
    isLoading: false,
    skills: [
      {
        name: 'triage',
        repoUrl: 'r',
        path: 'a',
        commitSha: 'c',
        tags: ['ops'],
      },
      { name: 'helm', repoUrl: 'r', path: 'b', commitSha: 'c' },
    ],
  }),
}));

function agent(tags: string) {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: {
        name: 'a',
        namespace: 'n',
        annotations: { 'ui.giantswarm.io/tags': tags },
      },
    } as never,
    'gazelle',
  );
}

describe('AgentTagSource', () => {
  it('reports the agents’ tags on every installation with kagent', async () => {
    mockUseResources.mockReturnValue({
      resources: [agent('util,ops'), agent('ops')],
      isLoading: false,
    });
    const onTags = jest.fn();
    render(<AgentTagSource onTags={onTags} />);

    await waitFor(() =>
      expect(onTags).toHaveBeenCalledWith([['util', 'ops'], ['ops']]),
    );
    expect(mockUseResources.mock.calls[0][0]).toEqual(['gazelle', 'golem']);
  });
});

describe('SkillTagSource', () => {
  it('reports each skill’s tags, none for a skill without', async () => {
    const onTags = jest.fn();
    render(<SkillTagSource onTags={onTags} />);

    await waitFor(() => expect(onTags).toHaveBeenCalledWith([['ops'], []]));
  });
});
