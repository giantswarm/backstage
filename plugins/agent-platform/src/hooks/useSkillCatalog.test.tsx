import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import {
  dehydrate,
  hydrate,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import { useSkillCatalog } from './useSkillCatalog';
import { useSkillSource, type SkillSource } from './useSkillSource';

jest.mock('./useSkillSource', () => ({ useSkillSource: jest.fn() }));
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: jest.fn(),
}));

const fetchMock = jest.fn();
const commit = 'b'.repeat(40);

function render(
  installation?: string,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
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
  it.each(['portal', 'skill-manager'] as const)(
    'restores private repositories after persisting the %s catalog as JSON',
    async kind => {
      const repoUrl = 'https://github.com/giantswarm/private-skills';
      givenConfig([repoUrl]);
      const skill = {
        name: 'private-skill',
        description: '',
        repoUrl,
        path: 'private-skill',
        ref: 'main',
        commit,
      };
      const listSkills = jest.fn().mockResolvedValue({
        repositories: [
          { repoUrl, private: true, truncated: false, skills: [skill] },
        ],
      });
      jest.mocked(useSkillSource).mockReturnValue(
        kind === 'portal'
          ? { kind }
          : ({
              kind,
              installation: 'graveler',
              client: { listSkills },
            } as unknown as SkillSource),
      );
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ skills: [skill], private: true }),
      });
      // A fresh restored entry must work before any network refresh can repair it.
      const options = {
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      };
      const original = new QueryClient(options);
      const first = render('graveler', original);
      await waitFor(() => expect(first.result.current.skills).toHaveLength(1));
      expect(first.result.current.privateRepositories.has(repoUrl)).toBe(true);
      const persisted = JSON.stringify(dehydrate(original));
      first.unmount();
      original.clear();
      fetchMock.mockClear();
      listSkills.mockClear();

      const restored = new QueryClient(options);
      hydrate(restored, JSON.parse(persisted));
      const second = render('graveler', restored);
      expect(second.result.current.skills[0].name).toBe('private-skill');
      expect(second.result.current.privateRepositories.has(repoUrl)).toBe(true);
      expect(
        second.result.current.privateRepositories.has(
          'https://github.com/giantswarm/public',
        ),
      ).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(listSkills).not.toHaveBeenCalled();
      second.unmount();
      restored.clear();
    },
  );

  it.each(['portal', 'skill-manager'] as const)(
    'refetches the old %s cache whose Set became an object',
    async kind => {
      const repoUrl = 'https://github.com/giantswarm/private-skills';
      givenConfig([repoUrl]);
      const listSkills = jest.fn().mockResolvedValue({
        repositories: [
          { repoUrl, private: true, truncated: false, skills: [] },
        ],
      });
      jest.mocked(useSkillSource).mockReturnValue(
        kind === 'portal'
          ? { kind }
          : ({
              kind,
              installation: 'graveler',
              client: { listSkills },
            } as unknown as SkillSource),
      );
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ skills: [], private: true }),
      });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const key =
        kind === 'portal'
          ? ['agent-platform', 'skills', repoUrl]
          : ['agent-platform', 'skill-manager', 'skills', 'graveler'];
      // The shape JSON.parse restores from the previous release's Set.
      client.setQueryData(key, { skills: [], privateRepositories: {} });
      const { result, unmount } = render('graveler', client);
      await waitFor(() =>
        expect(result.current.privateRepositories.has(repoUrl)).toBe(true),
      );
      expect(kind === 'portal' ? fetchMock : listSkills).toHaveBeenCalledTimes(
        1,
      );
      unmount();
      client.clear();
    },
  );

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
    expect(result.current.proposalTargets).toEqual([
      'https://github.com/giantswarm/agent-skills',
    ]);
  });

  it('offers the configured github.com repositories as targets, and names the rest', async () => {
    givenConfig([
      'https://github.com/giantswarm/agent-skills',
      'http://gitea.lab.local/lab/skills',
    ]);
    jest.mocked(useSkillSource).mockReturnValue({ kind: 'portal' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ skills: [], plugins: [] }),
    });
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.proposalTargets).toEqual([
      'https://github.com/giantswarm/agent-skills',
    ]);
    expect(result.current.unproposableRepositories).toEqual([
      'http://gitea.lab.local/lab/skills',
    ]);
  });

  it('is loading while the source is not known', () => {
    jest.mocked(useSkillSource).mockReturnValue({ kind: 'pending' });
    const { result } = render();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasRepositories).toBe(true);
    expect(result.current.proposalTargets).toEqual([]);
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

  it('names the failure and keeps the skills step when muster cannot be asked', () => {
    jest.mocked(useSkillSource).mockReturnValue({
      kind: 'unreachable',
      installation: 'graveler',
    });
    const { result } = render('graveler');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasRepositories).toBe(true);
    expect(result.current.skills).toEqual([]);
    expect(result.current.error?.message).toMatch(/muster on graveler/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
