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
import { PullModelDialog, type PullTarget } from './PullModelDialog';

const pullModel = jest.fn();
const post = jest.fn();
const onOpenChange = jest.fn();

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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderInTestApp(
    <Wrapper>
      <PullModelDialog isOpen onOpenChange={onOpenChange} targets={targets} />
    </Wrapper>,
  );
}

beforeEach(() => {
  pullModel.mockReset();
  post.mockReset();
  onOpenChange.mockReset();
});

describe('PullModelDialog', () => {
  it('starts the pull with the reference and the wire choice, then closes with a toast', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render();
    const dialog = screen.getByRole('dialog');

    await userEvent.type(
      within(dialog).getByLabelText(/Model reference/),
      ' qwen2.5:0.5b ',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', {
        model: 'qwen2.5:0.5b',
        wire: true,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pulling qwen2.5:0.5b on lab',
        status: 'info',
      }),
    );
  });

  it('passes wire=false when the switch is turned off', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render();
    const dialog = screen.getByRole('dialog');

    await userEvent.type(
      within(dialog).getByLabelText(/Model reference/),
      'smollm2:135m',
    );
    await userEvent.click(within(dialog).getByRole('switch'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));

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
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText(/Model reference/),
      'smollm2:135m',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', { model: 'smollm2:135m' }),
    );
  });

  it('says when an identical pull was joined rather than started', async () => {
    pullModel.mockResolvedValue({ job, created: false });
    await render();
    const dialog = screen.getByRole('dialog');

    await userEvent.type(
      within(dialog).getByLabelText(/Model reference/),
      'qwen2.5:0.5b',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'qwen2.5:0.5b is already being pulled on lab',
        }),
      ),
    );
  });

  it('refuses a malformed reference before sending anything', async () => {
    await render();
    const dialog = screen.getByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));
    expect(
      await within(dialog).findByText(/Enter a model reference/),
    ).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText(/Model reference/),
      'has space:1b',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));
    expect(await within(dialog).findByText(/no spaces/)).toBeInTheDocument();

    expect(pullModel).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('stays open and shows the failure when the backend refuses', async () => {
    pullModel.mockRejectedValue(
      new Error('backend_error: registry unreachable'),
    );
    await render();
    const dialog = screen.getByRole('dialog');

    await userEvent.type(
      within(dialog).getByLabelText(/Model reference/),
      'qwen2.5:0.5b',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));

    expect(
      await within(dialog).findByText('backend_error: registry unreachable'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('lets the user pick the installation when several can pull', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render([
      { name: 'lab', canWire: true },
      { name: 'gpu', canWire: true },
    ]);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Installation')).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText(/Model reference/),
      'qwen2.5:0.5b',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));

    // The first target is preselected.
    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', expect.anything()),
    );
  });
});

describe('PullModelDialog · an installation running several backends', () => {
  it('lists each backend as its own target and pulls on the chosen one', async () => {
    pullModel.mockResolvedValue({ job, created: true });
    await render([
      { name: 'lab', backend: 'ollama', canWire: true },
      { name: 'lab', backend: 'lemonade', canWire: true },
    ]);

    const select = screen.getByRole('button', {
      name: /Installation and backend/,
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
