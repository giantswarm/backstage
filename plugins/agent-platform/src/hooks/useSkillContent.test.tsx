import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSkillContent } from './useSkillContent';

const fetchMock = jest.fn();
const fetchApi = { fetch: fetchMock } as unknown as typeof fetchApiRef.T;

const skill = {
  repoUrl: 'https://github.com/giantswarm/skills',
  path: 'support/ticket-triage',
  ref: 'main',
  commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
};

function renderUseSkillContent(target: typeof skill | undefined) {
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
  return renderHook(() => useSkillContent(target), { wrapper });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useSkillContent', () => {
  it('reads the SKILL.md at the skill’s commit', async () => {
    const content = {
      ...skill,
      name: 'ticket-triage',
      description: 'How to triage.',
      instructions: 'Classify.',
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => content });

    const { result } = renderUseSkillContent(skill);

    await waitFor(() => expect(result.current.content).toEqual(content));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/gs\/agent-skills\/content$/);
    expect(Object.fromEntries(url.searchParams)).toEqual(skill);
  });

  it('surfaces the backend’s reason without retrying', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: { message: 'Failed to read the skill: main has moved on.' },
      }),
    });

    const { result } = renderUseSkillContent(skill);

    await waitFor(() =>
      expect(result.current.error?.message).toBe(
        'Failed to read the skill: main has moved on.',
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads nothing without a skill', () => {
    const { result } = renderUseSkillContent(undefined);

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
