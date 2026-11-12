import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { useSetDefaultModelConfig } from './useSetDefaultModelConfig';

const mockPatchResource = jest.fn();
const mockFetchResourceList = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  patchResource: (...args: unknown[]) => mockPatchResource(...args),
  fetchResourceList: (...args: unknown[]) => mockFetchResourceList(...args),
}));

// The platform namespace's path: no organization, so no credential form to
// link to (the organization path is covered through the Models router).
jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef: () => undefined,
}));

// The organization directory: empty, and answered unless a case says it
// could not reach agent-manager.
let mockDiscoveryErrors: string[] = [];
jest.mock('../components/OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../components/OrganizationDirectoryProvider'),
  useOrganizationDirectory: () => ({
    ...jest.requireActual('../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
    discoveryErrors: mockDiscoveryErrors,
  }),
}));

const MARK = 'agent-platform.giantswarm.io/is-default-model-config';
const analyticsApi = mockApis.analytics.mock();

function json(
  name: string,
  marked = false,
  labels: Record<string, string> = {},
) {
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: {
      name,
      namespace: 'kagent',
      labels,
      ...(marked ? { annotations: { [MARK]: 'true' } } : {}),
    },
    spec: { provider: 'Anthropic', model: name },
  } as ModelConfigInterface;
}

function setup() {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [kubernetesApiRef, { proxy: jest.fn() }],
        [analyticsApiRef, analyticsApi],
      ]}
    >
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

async function setDefaultError(
  result: { current: ReturnType<typeof useSetDefaultModelConfig> },
  input: Parameters<
    ReturnType<typeof useSetDefaultModelConfig>['setDefault']
  >[0],
): Promise<Error> {
  let error: Error | undefined;
  await act(async () => {
    try {
      await result.current.setDefault(input);
    } catch (caught) {
      error = caught as Error;
    }
  });
  if (!error) {
    throw new Error('the move did not fail');
  }
  return error;
}

beforeEach(() => {
  mockDiscoveryErrors = [];
  jest.mocked(analyticsApi.captureEvent).mockClear();
  mockPatchResource.mockReset();
  mockPatchResource.mockResolvedValue(undefined);
  mockFetchResourceList.mockReset();
});

describe('useSetDefaultModelConfig', () => {
  it('marks the new default first, then unmarks the old one, and reports it', async () => {
    mockFetchResourceList.mockResolvedValue([
      json('sonnet', true),
      json('opus'),
    ]);
    const { result } = setup();

    await act(async () => {
      await result.current.setDefault({
        modelConfig: new ModelConfig(json('opus'), 'gazelle'),
        expected: ['sonnet'],
      });
    });

    expect(mockFetchResourceList).toHaveBeenCalledWith(
      expect.objectContaining({ cluster: 'gazelle', namespace: 'kagent' }),
    );
    expect(mockPatchResource.mock.calls.map(([options]) => options)).toEqual([
      expect.objectContaining({
        name: 'opus',
        patch: { metadata: { annotations: { [MARK]: 'true' } } },
      }),
      expect.objectContaining({
        name: 'sonnet',
        patch: { metadata: { annotations: { [MARK]: null } } },
      }),
    ]);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.defaultModelSet',
        attributes: {},
      }),
    );
  });

  it('refuses a namespace it cannot tell from an organization, writing nothing', async () => {
    mockDiscoveryErrors = ['Could not reach agent-manager on gazelle.'];
    const { result } = setup();

    const error = await setDefaultError(result, {
      modelConfig: new ModelConfig(
        {
          ...json('opus'),
          metadata: { name: 'opus', namespace: 'agents-payments-x7k2q' },
        },
        'gazelle',
      ),
      expected: [],
    });

    expect(error.message).toMatch(/Could not tell whether/);
    expect(mockFetchResourceList).not.toHaveBeenCalled();
    expect(mockPatchResource).not.toHaveBeenCalled();
  });

  it('refuses a second mark that appeared meanwhile, writing nothing', async () => {
    mockFetchResourceList.mockResolvedValue([
      json('haiku', true),
      json('opus'),
    ]);
    const { result } = setup();

    const error = await setDefaultError(result, {
      modelConfig: new ModelConfig(json('opus'), 'gazelle'),
      expected: [],
    });

    expect(error.message).toMatch(/haiku became the default/);
    expect(mockPatchResource).not.toHaveBeenCalled();
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('refuses to take the mark off a Helm-managed default', async () => {
    mockFetchResourceList.mockResolvedValue([
      json('sonnet', true, { 'app.kubernetes.io/managed-by': 'Helm' }),
      json('opus'),
    ]);
    const { result } = setup();

    const error = await setDefaultError(result, {
      modelConfig: new ModelConfig(json('opus'), 'gazelle'),
      expected: ['sonnet'],
    });

    expect(error.message).toMatch(
      /Move the default in that release's values\./,
    );
    expect(mockPatchResource).not.toHaveBeenCalled();
  });

  it('says there is no default when the old mark could not be removed', async () => {
    mockFetchResourceList.mockResolvedValue([
      json('sonnet', true),
      json('opus'),
    ]);
    mockPatchResource
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('forbidden'));
    const { result } = setup();

    const error = await setDefaultError(result, {
      modelConfig: new ModelConfig(json('opus'), 'gazelle'),
      expected: ['sonnet'],
    });

    expect(error.message).toBe(
      'opus is marked as the default, but the mark on sonnet could not be removed, so there is no default until it is. Make opus the default again to retry. Reason: forbidden',
    );
  });
});
