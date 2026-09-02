import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { toastApiRef } from '@backstage/frontend-plugin-api';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import type { ModelManagerApi } from '../../apis/ModelManagerApi';
import type { ClientServingSummary } from '../../lib/serving';
import { modelsRouteRef } from '../../routes';
import {
  describeServedBy,
  describeServedModel,
  ModelServingStatus,
  servingTitle,
} from './ModelServingStatus';

const loadModel = jest.fn();
const pullModel = jest.fn();
const post = jest.fn();

const modelManagerApi = {
  loadModel,
  pullModel,
} as unknown as ModelManagerApi;

const idle: ClientServingSummary = {
  installation: 'lab',
  backend: 'ollama',
  readiness: 'idle',
  name: 'qwen3:0.6b',
  message: 'Downloaded; not loaded.',
};

const goneOllama: ClientServingSummary = {
  installation: 'lab',
  backend: 'ollama',
  readiness: 'notServing',
  name: 'qwen2.5:0.5b',
  message: 'Ollama model qwen2.5:0.5b is not on the backend at 172.21.0.1.',
};

const goneKserve: ClientServingSummary = {
  installation: 'gpu',
  backend: 'kserve',
  readiness: 'notServing',
  name: 'lab-echo',
  namespace: 'model-serving',
  message: 'InferenceService model-serving/lab-echo is not serving.',
};

// Only the parent RouteRef is mountable; the Serving sub-route resolves
// relative to it.
const render = (element: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [modelManagerApiRef, modelManagerApi],
        [toastApiRef, { post }],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderInTestApp(<Wrapper>{element}</Wrapper>, {
    mountedRoutes: { '/agent-platform/models': modelsRouteRef },
  });
};

beforeEach(() => {
  loadModel.mockReset();
  pullModel.mockReset();
  post.mockReset();
  loadModel.mockResolvedValue({});
  pullModel.mockResolvedValue({ job: { id: 'j1' }, created: true });
});

describe('describeServedModel / describeServedBy / servingTitle', () => {
  it('names the model the backend’s way, with its namespace where it has one', () => {
    expect(describeServedModel(idle)).toBe('Ollama model qwen3:0.6b');
    expect(describeServedModel(goneKserve)).toBe(
      'InferenceService model-serving/lab-echo',
    );
  });

  it('says "served by" only while something serves', () => {
    expect(describeServedBy(idle)).toBe('Served by Ollama model qwen3:0.6b');
    expect(describeServedBy(goneOllama)).toBe(
      'Points at Ollama model qwen2.5:0.5b',
    );
  });

  it('puts the vocabulary’s phrase and the backend’s reason in the tooltip', () => {
    expect(servingTitle(idle)).toBe(
      'Ollama model qwen3:0.6b is idle — loads on first request — Downloaded; not loaded.',
    );
    expect(servingTitle(goneKserve)).toBe(
      'InferenceService model-serving/lab-echo is not serving — InferenceService model-serving/lab-echo is not serving.',
    );
  });
});

describe('ModelServingStatus', () => {
  it('renders the shared label and, without a shortcut, links Not serving to the Serving view', async () => {
    await render(<ModelServingStatus serving={goneKserve} />);

    expect(screen.getByTestId('model-serving-readiness')).toHaveTextContent(
      'Not serving',
    );
    expect(screen.getByRole('link', { name: 'Serving view' })).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers no link and no button for a state that needs no hand', async () => {
    await render(<ModelServingStatus serving={idle} />);

    expect(screen.getByTestId('model-serving-readiness')).toHaveTextContent(
      'Idle',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('runs a Load through model-manager and reports it', async () => {
    await render(
      <ModelServingStatus
        serving={idle}
        shortcut={{ kind: 'load', ref: 'qwen3:0.6b' }}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Load qwen3:0.6b' }),
    );

    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith('lab', { model: 'qwen3:0.6b' }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'qwen3:0.6b: loaded into memory',
          status: 'success',
        }),
      ),
    );
    // The link is for the case without a shortcut.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('calls the same load "Serve" on KServe, where it creates the InferenceService', async () => {
    await render(
      <ModelServingStatus
        serving={goneKserve}
        shortcut={{ kind: 'load', ref: 'lab-echo' }}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Serve lab-echo' }),
    );

    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith('gpu', { model: 'lab-echo' }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'lab-echo: InferenceService requested',
          status: 'success',
        }),
      ),
    );
  });

  it('pulls a gone Ollama model by the client’s reference, without wiring', async () => {
    await render(
      <ModelServingStatus
        serving={goneOllama}
        shortcut={{ kind: 'pull', ref: 'qwen2.5:0.5b' }}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Pull qwen2.5:0.5b' }),
    );

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', {
        model: 'qwen2.5:0.5b',
        wire: false,
      }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'qwen2.5:0.5b: pull started',
          status: 'success',
        }),
      ),
    );
  });

  it('reports a failure through a toast', async () => {
    pullModel.mockRejectedValue(new Error('registry unreachable'));
    await render(
      <ModelServingStatus
        serving={goneOllama}
        shortcut={{ kind: 'pull', ref: 'qwen2.5:0.5b' }}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Pull qwen2.5:0.5b' }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Pull failed for qwen2.5:0.5b',
          description: 'registry unreachable',
          status: 'danger',
        }),
      ),
    );
  });
});
