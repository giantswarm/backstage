import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useChatGptConnection } from './useChatGptConnection';

/** The ModelConfig the targeted read answers; undefined for a refused read. */
let mockModelConfig: ModelConfig | undefined;
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: () => ({ resource: mockModelConfig, isLoading: false }),
}));

function modelConfig(spec: Record<string, unknown>) {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'codex', namespace: 'team-a' },
      spec: { provider: 'OpenAI', model: 'gpt-5.5', ...spec },
    } as never,
    'graveler',
  );
}

function render(chatgpt: 'connected' | 'auth_required' | 'pending') {
  const api = {
    getAuthStatus: jest.fn(() =>
      Promise.resolve({
        servers: [],
        providerApps: [{ name: 'chatgpt', status: chatgpt }],
      }),
    ),
  } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    api,
    ...renderHook(
      () =>
        useChatGptConnection('graveler', {
          namespace: 'team-a',
          name: 'codex',
        }),
      { wrapper },
    ),
  };
}

describe('useChatGptConnection', () => {
  it("blocks a turn on the person's ChatGPT model while they are not connected", async () => {
    mockModelConfig = modelConfig({
      openAI: { credentialType: 'chatgptOAuth' },
    });
    const { result } = render('auth_required');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({
      isPersonalModel: true,
      blocksTurn: true,
      isLoading: false,
    });
  });

  it('blocks it while a code is outstanding', async () => {
    mockModelConfig = modelConfig({
      openAI: { credentialType: 'chatgptOAuth' },
    });
    const { result } = render('pending');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.blocksTurn).toBe(true);
  });

  it('lets it go once the person is connected', async () => {
    mockModelConfig = modelConfig({
      openAI: { credentialType: 'chatgptOAuth' },
    });
    const { result } = render('connected');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.blocksTurn).toBe(false);
  });

  it('is no gate for any other model, and reads no muster status', async () => {
    mockModelConfig = modelConfig({ apiKeySecret: 'openai-key' });
    const { result, api } = render('auth_required');

    expect(result.current).toEqual({
      isPersonalModel: false,
      blocksTurn: false,
      isLoading: false,
    });
    expect(api.getAuthStatus).not.toHaveBeenCalled();
  });

  it('is no gate when the person may not read the ModelConfig', () => {
    mockModelConfig = undefined;
    const { result } = render('auth_required');

    expect(result.current.blocksTurn).toBe(false);
  });
});
