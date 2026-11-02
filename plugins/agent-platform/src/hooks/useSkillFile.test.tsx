import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSkillFile } from './useSkillFile';

const fetchMock = jest.fn();
const fetchApi = { fetch: fetchMock } as unknown as typeof fetchApiRef.T;

const skill = {
  repoUrl: 'https://github.com/giantswarm/skills',
  path: 'support/ticket-triage',
  ref: 'main',
  commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
};

function renderUseSkillFile(
  target: typeof skill | undefined,
  file: string | undefined,
) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [discoveryApiRef, mockApis.discovery()],
        [fetchApiRef, fetchApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useSkillFile(target, file), { wrapper });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useSkillFile', () => {
  it('reads one listed file at the skill’s commit, ref included', async () => {
    const answer = {
      path: 'references/setup.md',
      size: 12,
      sha: 'f00',
      binary: false,
      truncated: false,
      content: '# Setup',
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => answer });

    const { result } = renderUseSkillFile(skill, 'references/setup.md');

    await waitFor(() => expect(result.current.file).toEqual(answer));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/gs\/agent-skills\/content\/file$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ...skill,
      file: 'references/setup.md',
    });
  });

  it('surfaces the backend’s reason without retrying', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: { message: 'Not one of the skill’s files.' },
      }),
    });

    const { result } = renderUseSkillFile(skill, 'nope.md');

    await waitFor(() =>
      expect(result.current.error?.message).toBe(
        'Not one of the skill’s files.',
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads nothing without a file', () => {
    const { result } = renderUseSkillFile(skill, undefined);

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
