import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { toastApiRef } from '@backstage/frontend-plugin-api';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import type { ModelManagerApi } from '../../apis/ModelManagerApi';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { PullModelPage, type PullTarget } from './PullModelPage';

const pullModel = jest.fn();
const post = jest.fn();
const onPulled = jest.fn();

const modelManagerApi = { pullModel } as unknown as ModelManagerApi;

const job = {
  id: 'j1',
  type: 'pull',
  model: 'qwen2.5:0.5b',
  phase: 'running',
  bytesCompleted: 0,
  bytesTotal: 0,
  percent: 0,
  wire: true,
};

function render(targets: PullTarget[] = [{ name: 'lab', canWire: true }]) {
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
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>{children}</PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>
  );
  return renderInTestApp(
    <Wrapper>
      <PullModelPage
        targets={targets}
        closeHref="/customize/models/hosting"
        onPulled={onPulled}
      />
    </Wrapper>,
  );
}

beforeEach(() => {
  pullModel.mockReset();
  post.mockReset();
  onPulled.mockReset();
});

describe('PullModelPage', () => {
  it('starts the pull with the reference and the wire choice, then hands over with a toast', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render();
    const page = document.body;

    await userEvent.type(
      within(page).getByLabelText(/Model reference/),
      ' qwen2.5:0.5b ',
    );
    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', {
        model: 'qwen2.5:0.5b',
        wire: true,
      }),
    );
    await waitFor(() => expect(onPulled).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pulling qwen2.5:0.5b on lab',
        status: 'success',
      }),
    );
  });

  it('passes wire=false when the switch is turned off', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render();
    const page = document.body;

    await userEvent.type(
      within(page).getByLabelText(/Model reference/),
      'smollm2:135m',
    );
    await userEvent.click(within(page).getByRole('switch'));
    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', {
        model: 'smollm2:135m',
        wire: false,
      }),
    );
  });

  it('offers no wire choice when the backend cannot wire', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render([{ name: 'lab', canWire: false }]);
    const page = document.body;

    expect(within(page).queryByRole('switch')).not.toBeInTheDocument();
    await userEvent.type(
      within(page).getByLabelText(/Model reference/),
      'smollm2:135m',
    );
    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', { model: 'smollm2:135m' }),
    );
  });

  it('says when an identical pull was joined rather than started', async () => {
    pullModel.mockResolvedValue({ job, created: false });
    await render();
    const page = document.body;

    await userEvent.type(
      within(page).getByLabelText(/Model reference/),
      'qwen2.5:0.5b',
    );
    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'qwen2.5:0.5b is already being pulled on lab',
        }),
      ),
    );
  });

  it('refuses a malformed reference before sending anything, on the field', async () => {
    await render();
    const page = document.body;
    const field = within(page).getByRole('textbox', {
      name: /Model reference/,
    });

    // Quiet until the first attempt; Pull stays pressable.
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(within(page).getByRole('button', { name: 'Pull' })).toBeEnabled();

    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));
    expect(
      await within(page).findByText(/Enter a model reference/),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    expect(within(page).queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.type(
      within(page).getByLabelText(/Model reference/),
      'has space:1b',
    );
    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));
    expect(await within(page).findByText(/no spaces/)).toBeInTheDocument();

    expect(pullModel).not.toHaveBeenCalled();
    expect(onPulled).not.toHaveBeenCalled();
  });

  it('is a page whose Cancel leads back, and hands over once the pull is accepted', async () => {
    let answer: (value: unknown) => void = () => {};
    pullModel.mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      }),
    );
    await render();
    const page = document.body;

    await userEvent.type(
      within(page).getByLabelText(/Model reference/),
      'qwen2.5:0.5b',
    );
    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));
    await within(page).findByRole('button', { name: /Starting/ });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pull model' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/customize/models/hosting',
    );

    expect(onPulled).not.toHaveBeenCalled();
    answer({ job, created: true });
    await waitFor(() => expect(onPulled).toHaveBeenCalledTimes(1));
  });

  it('stays and shows the failure when the backend refuses', async () => {
    pullModel.mockRejectedValue(
      new Error('backend_error: registry unreachable'),
    );
    await render();
    const page = document.body;

    await userEvent.type(
      within(page).getByLabelText(/Model reference/),
      'qwen2.5:0.5b',
    );
    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));

    expect(
      await within(page).findByText('backend_error: registry unreachable'),
    ).toBeInTheDocument();
    expect(onPulled).not.toHaveBeenCalled();
  });

  it('lets the user pick the installation when several can pull', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render([
      { name: 'lab', canWire: true },
      { name: 'gpu', canWire: true },
    ]);
    const page = document.body;

    expect(within(page).getByText('Environment')).toBeInTheDocument();
    await userEvent.type(
      within(page).getByLabelText(/Model reference/),
      'qwen2.5:0.5b',
    );
    await userEvent.click(within(page).getByRole('button', { name: 'Pull' }));

    // The first target is preselected.
    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', expect.anything()),
    );
  });
});

describe('PullModelPage · an installation running several backends', () => {
  it('lists each backend as its own target and pulls on the chosen one', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render([
      { name: 'lab', backend: 'ollama', canWire: true },
      { name: 'lab', backend: 'lemonade', canWire: true },
    ]);

    const select = screen.getByRole('button', {
      name: /Environment and backend/,
    });
    await userEvent.click(select);
    await userEvent.click(
      screen.getByRole('option', { name: 'lab · Lemonade' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /Model reference/ }),
      'qwen3-4b-FLM',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', {
        model: 'qwen3-4b-FLM',
        backend: 'lemonade',
        wire: true,
      }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Pulling qwen3-4b-FLM on lab · Lemonade',
        }),
      ),
    );
  });
});

describe('PullModelPage · the environment select at scale', () => {
  const openEnvironments = async () =>
    userEvent.click(screen.getByRole('button', { name: /Environment/ }));

  it('offers three environments without a search', async () => {
    await render(['lab', 'gpu', 'edge'].map(name => ({ name, canWire: true })));

    await openEnvironments();
    expect(
      await screen.findByRole('option', { name: 'edge' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('offers type-ahead over 300 environments', async () => {
    await render(
      Array.from({ length: 300 }, (_, i) => ({
        name: `inst-${i + 1}`,
        canWire: true,
      })),
    );

    await openEnvironments();
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
  });
});
