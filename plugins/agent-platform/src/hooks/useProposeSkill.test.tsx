import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  analyticsApiRef,
  discoveryApiRef,
  fetchApiRef,
  githubAuthApiRef,
} from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProposeSkill, type ProposedSkill } from './useProposeSkill';

const analyticsApi = mockApis.analytics.mock();
const discoveryApi = mockApis.discovery();

const getAccessToken = jest.fn();
const githubAuthApi = {
  getAccessToken,
} as unknown as typeof githubAuthApiRef.T;

const fetchMock = jest.fn();
const fetchApi = { fetch: fetchMock } as unknown as typeof fetchApiRef.T;

const opened = {
  pullRequestUrl: 'https://github.com/giantswarm/skills/pull/7',
  number: 7,
  branch: 'add-skill/notes',
  base: 'main',
  path: 'notes/SKILL.md',
};

const skill: ProposedSkill = {
  repoUrl: 'https://github.com/giantswarm/skills',
  skillName: 'notes',
  description: 'How to take notes.',
  instructions: 'Write things down.',
};

function renderUseProposeSkill() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [analyticsApiRef, analyticsApi],
        [discoveryApiRef, discoveryApi],
        [fetchApiRef, fetchApi],
        [githubAuthApiRef, githubAuthApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useProposeSkill(), { wrapper });
}

beforeEach(() => {
  jest.mocked(analyticsApi.captureEvent).mockClear();
  getAccessToken.mockReset();
  getAccessToken.mockResolvedValue('gh-token');
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => opened,
  });
});

describe('useProposeSkill', () => {
  it('sends the proposal with the person’s GitHub token and reports the event', async () => {
    const { result } = renderUseProposeSkill();

    let answer;
    await act(async () => {
      answer = await result.current.proposeSkill(skill);
    });

    expect(answer).toEqual(opened);
    expect(getAccessToken).toHaveBeenCalledWith('repo');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/gs\/agent-skills\/pull-request$/);
    expect(init.headers['gs-github-token']).toBe('gh-token');
    expect(JSON.parse(init.body)).toEqual(skill);

    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.skillProposed',
        attributes: {},
      }),
    );
  });

  it('surfaces the backend’s reason and reports nothing on a refusal', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          message: 'A skill named notes already exists in giantswarm/skills.',
        },
      }),
    });
    const { result } = renderUseProposeSkill();

    await act(async () => {
      await expect(result.current.proposeSkill(skill)).rejects.toThrow(
        'A skill named notes already exists in giantswarm/skills.',
      );
    });

    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
