import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/frontend-test-utils';
import {
  scaffolderApiRef,
  SecretsContextProvider,
} from '@backstage/plugin-scaffolder-react';
import { useStartTemplateTask } from './useStartTemplateTask';

const analyticsApi = mockApis.analytics.mock();
const scaffolderApi = { scaffold: jest.fn() };

const values = { name: 'my-app', token: { oidcTokenInstallation: 'golem' } };

function wrapper({ children }: PropsWithChildren<{}>) {
  return (
    <TestApiProvider
      apis={[
        [analyticsApiRef, analyticsApi],
        [scaffolderApiRef, scaffolderApi],
      ]}
    >
      <SecretsContextProvider initialSecrets={{ GITHUB_TOKEN: 'gh' }}>
        {children}
      </SecretsContextProvider>
    </TestApiProvider>
  );
}

function renderStart() {
  return renderHook(() => useStartTemplateTask('template:default/app'), {
    wrapper,
  });
}

describe('useStartTemplateTask', () => {
  beforeEach(() => {
    jest.mocked(analyticsApi.captureEvent).mockClear();
    scaffolderApi.scaffold.mockReset();
  });

  it('starts the task with the form secrets and reports it', async () => {
    scaffolderApi.scaffold.mockResolvedValue({ taskId: 'task-1' });
    const { result } = renderStart();

    await act(async () => {
      await expect(result.current.mutateAsync(values)).resolves.toEqual({
        taskId: 'task-1',
      });
    });

    expect(scaffolderApi.scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/app',
      values,
      secrets: { GITHUB_TOKEN: 'gh' },
    });
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Scaffolder.taskStarted',
        attributes: {},
      }),
    );
  });

  it('reports nothing when the task is not started', async () => {
    const failure = new Error('500');
    scaffolderApi.scaffold.mockRejectedValue(failure);
    const { result } = renderStart();

    await act(async () => {
      await expect(result.current.mutateAsync(values)).rejects.toBe(failure);
    });

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
