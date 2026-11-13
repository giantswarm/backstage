import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { useSetDefaultModelConfig } from './useSetDefaultModelConfig';

const mockCallTool = jest.fn();
const analyticsApi = mockApis.analytics.mock();
const mockDescribeTool = jest.fn(async () => ({
  inputSchema: {
    properties: Object.fromEntries(
      ['projectID', 'location', 'endpoint', 'displayName', 'noCredential'].map(
        field => [field, {}],
      ),
    ),
  },
}));
jest.mock('./useMusterPluginApi', () => ({
  useMusterPluginApi: () => ({
    callTool: mockCallTool,
    describeTool: mockDescribeTool,
  }),
}));
jest.mock('../components/OrganizationDirectoryProvider', () => ({
  useOrganizationDirectory: () => ({ directory: new Map() }),
}));
jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef: () => () => '/credential-form',
}));

function setup() {
  const wrapper = ({ children }: PropsWithChildren) => (
    <TestApiProvider apis={[[analyticsApiRef, analyticsApi]]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useSetDefaultModelConfig(), { wrapper });
}

const model = new ModelConfig(
  {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: { name: 'sonnet', namespace: 'kagent' },
    spec: { provider: 'Anthropic', model: 'claude-sonnet' },
  } as ModelConfigInterface,
  'gazelle',
);

beforeEach(() => {
  mockCallTool.mockReset();
  analyticsApi.captureEvent.mockClear();
});

it('sets the installation default through agent-manager without a credential value', async () => {
  mockCallTool.mockResolvedValue({ defaultModel: 'sonnet' });
  const { result } = setup();
  await act(async () => {
    await result.current.setDefault({ modelConfig: model, expected: [] });
  });
  expect(mockCallTool).toHaveBeenCalledWith(
    'x_agent-manager_set_organization_model',
    {
      namespace: 'kagent',
      name: 'sonnet',
      default: true,
      requestId: expect.any(String),
    },
    'gazelle',
    { urlElicitation: false },
  );
  expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
  expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'AgentPlatform.defaultModelSet',
      attributes: {},
    }),
  );
});

it('opens the credential form when the default operation needs a missing credential', async () => {
  mockCallTool.mockResolvedValue({
    pending: true,
    credentialOperation: 'a1'.repeat(24),
  });
  const { result } = setup();
  let saved;
  await act(async () => {
    saved = await result.current.setDefault({
      modelConfig: model,
      expected: [],
    });
  });
  expect(saved).toEqual({ form: '/credential-form' });
  expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
});

it('refuses a manager without the model credential contract before issuing a write', async () => {
  mockDescribeTool.mockResolvedValueOnce({ inputSchema: { properties: {} } });
  const { result } = setup();
  await act(async () => {
    await expect(
      result.current.setDefault({ modelConfig: model, expected: [] }),
    ).rejects.toThrow('model credential operations');
  });
  expect(mockCallTool).not.toHaveBeenCalled();
  expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
});

it('does not report a default change when the manager refuses it', async () => {
  mockCallTool.mockRejectedValue(new Error('forbidden'));
  const { result } = setup();
  await act(async () => {
    await expect(
      result.current.setDefault({ modelConfig: model, expected: [] }),
    ).rejects.toThrow();
  });
  expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
});
