import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/frontend-test-utils';
import {
  scaffolderApiRef,
  SecretsContextProvider,
} from '@backstage/plugin-scaffolder-react';
import type { TemplateParameterSchema } from '@backstage/plugin-scaffolder-common';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { useStartTemplateTask } from './useStartTemplateTask';

const analyticsApi = mockApis.analytics.mock();
const scaffolderApi = { scaffold: jest.fn() };
const kubernetesApi = {
  getCluster: jest.fn().mockResolvedValue({
    authProvider: 'oidc',
    oidcTokenProvider: 'oidc-golem',
  }),
};
const kubernetesAuthProvidersApi = { getCredentials: jest.fn() };

const manifest = {
  title: 'Template',
  steps: [
    {
      title: 'Details',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          token: {
            type: 'object',
            'ui:field': 'GSOIDCToken',
            'ui:options': {
              secretsKey: 'USER_OIDC_TOKEN',
              installationName: 'golem',
            },
          },
        },
      },
    },
  ],
} as unknown as TemplateParameterSchema;

const values = { name: 'my-app', token: { oidcTokenInstallation: 'golem' } };

function wrapper({ children }: PropsWithChildren<{}>) {
  return (
    <TestApiProvider
      apis={[
        [analyticsApiRef, analyticsApi],
        [scaffolderApiRef, scaffolderApi],
        [kubernetesApiRef, kubernetesApi],
        [kubernetesAuthProvidersApiRef, kubernetesAuthProvidersApi],
      ]}
    >
      <SecretsContextProvider>{children}</SecretsContextProvider>
    </TestApiProvider>
  );
}

function renderStart() {
  return renderHook(
    () => useStartTemplateTask('template:default/app', manifest),
    { wrapper },
  );
}

describe('useStartTemplateTask', () => {
  beforeEach(() => {
    jest.mocked(analyticsApi.captureEvent).mockClear();
    scaffolderApi.scaffold.mockReset();
    kubernetesAuthProvidersApi.getCredentials.mockReset();
  });

  it('starts the task with a token minted at submit and reports it', async () => {
    kubernetesAuthProvidersApi.getCredentials.mockResolvedValue({
      token: 'submit-token',
    });
    scaffolderApi.scaffold.mockResolvedValue({ taskId: 'task-1' });
    const { result } = renderStart();

    await act(async () => {
      await expect(result.current.mutateAsync(values)).resolves.toEqual({
        taskId: 'task-1',
      });
    });

    expect(kubernetesAuthProvidersApi.getCredentials).toHaveBeenCalledWith(
      'oidc.oidc-golem',
    );
    expect(scaffolderApi.scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/app',
      values,
      secrets: { USER_OIDC_TOKEN: 'submit-token' },
    });
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Scaffolder.taskStarted',
        attributes: {},
      }),
    );
  });

  it('starts nothing and reports nothing when the sign-in is declined', async () => {
    const declined = Object.assign(
      new Error('Login failed, rejected by user'),
      {
        name: 'RejectedError',
      },
    );
    kubernetesAuthProvidersApi.getCredentials.mockRejectedValue(declined);
    const { result } = renderStart();

    await act(async () => {
      await expect(result.current.mutateAsync(values)).rejects.toBe(declined);
    });

    await waitFor(() => expect(result.current.error).toBe(declined));
    expect(scaffolderApi.scaffold).not.toHaveBeenCalled();
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('reports nothing when the task is not started', async () => {
    kubernetesAuthProvidersApi.getCredentials.mockResolvedValue({
      token: 'submit-token',
    });
    scaffolderApi.scaffold.mockRejectedValue(new Error('500'));
    const { result } = renderStart();

    await act(async () => {
      await expect(result.current.mutateAsync(values)).rejects.toThrow('500');
    });

    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
