import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import { useSkillCatalog } from './useSkillCatalog';
import { useSkillSource, type SkillSource } from './useSkillSource';

jest.mock('./useSkillSource', () => ({ useSkillSource: jest.fn() }));
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: jest.fn(),
}));

const fetchMock = jest.fn();
const commit = 'b'.repeat(40);

function render(installation?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [discoveryApiRef, mockApis.discovery()],
        [fetchApiRef, { fetch: fetchMock } as never],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useSkillCatalog(installation), { wrapper });
}

function givenConfig(repositories: string[]) {
  jest.mocked(useSignedInConfig).mockReturnValue({
    config: { getOptionalStringArray: () => repositories },
    isLoading: false,
  } as never);
}

beforeEach(() => {
  fetchMock.mockReset();
  givenConfig(['https://github.com/giantswarm/agent-skills']);
});

describe('useSkillCatalog', () => {
  it('lists skills and plugins from skill-manager, never the portal', async () => {
    const listSkills = jest.fn().mockResolvedValue({
      repositories: [
        {
          repoUrl: 'https://github.com/giantswarm/claude-code',
          ref: 'main',
          commit,
          truncated: false,
          skills: [
            { name: 'fluxcd', description: '', path: 'p/skills/fluxcd' },
          ],
          plugins: [
            { name: 'p', path: 'p', format: 'claude-code', skills: [] },
          ],
        },
      ],
    });
    jest.mocked(useSkillSource).mockReturnValue({
      kind: 'skill-manager',
      installation: 'graveler',
      client: { listSkills },
    } as unknown as SkillSource);

    const { result } = render('graveler');

    await waitFor(() => expect(result.current.skills).toHaveLength(1));
    expect(useSkillSource).toHaveBeenCalledWith('graveler');
    expect(result.current.plugins).toEqual([
      expect.objectContaining({ path: 'p', format: 'claude-code', commit }),
    ]);
    expect(result.current.hasRepositories).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('has no repositories when skill-manager has no sources, whatever the portal config', async () => {
    jest.mocked(useSkillSource).mockReturnValue({
      kind: 'skill-manager',
      installation: 'graveler',
      client: { listSkills: jest.fn().mockResolvedValue({ repositories: [] }) },
    } as unknown as SkillSource);
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasRepositories).toBe(false);
  });

  it('falls back to gs-backend discovery of the configured repositories', async () => {
    jest.mocked(useSkillSource).mockReturnValue({ kind: 'portal' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [
          {
            name: 'a',
            description: '',
            repoUrl: 'https://github.com/giantswarm/agent-skills',
            path: 'a',
            ref: 'main',
            commit,
          },
        ],
        plugins: [],
      }),
    });

    const { result } = render();

    await waitFor(() => expect(result.current.skills).toHaveLength(1));
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toMatch(
      /\/gs\/agent-skills$/,
    );
  });

  it('is loading while the source is not known', () => {
    jest.mocked(useSkillSource).mockReturnValue({ kind: 'pending' });
    const { result } = render();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasRepositories).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the skills step while skill-manager has not answered', () => {
    jest.mocked(useSkillSource).mockReturnValue({
      kind: 'skill-manager',
      installation: 'graveler',
      client: { listSkills: () => new Promise(() => {}) },
    } as unknown as SkillSource);
    const { result } = render();
    expect(result.current.isLoading).toBe(true);
    // The wizard decides on its skills step from it.
    expect(result.current.hasRepositories).toBe(true);
  });
});
