import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef, ToolDetail } from '../../apis';
import { ToolDetailPanel, ToolDetailPanelProps } from './ToolDetailPanel';

const detail: ToolDetail = {
  name: 'core_echo',
  description: 'Echoes a message back.',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'What to echo' },
    },
  },
};

function makeApi(): Pick<MusterApi, 'describeTool' | 'callTool'> {
  return {
    describeTool: jest.fn(() => Promise.resolve(detail)),
    callTool: jest.fn(() => Promise.resolve({ echoed: 'hi' })),
  };
}

async function renderPanel(
  api: Pick<MusterApi, 'describeTool' | 'callTool'>,
  note?: string,
  props: Partial<ToolDetailPanelProps> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <ToolDetailPanel name="core_echo" note={note} {...props} />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('ToolDetailPanel', () => {
  it('runs a workflow’s tool as its inputs, without the description', async () => {
    const api = makeApi();
    await renderPanel(api, undefined, {
      name: 'workflow_echo',
      subject: 'workflow',
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Inputs' }),
    ).toBeInTheDocument();
    // The workflow page's Overview says what it is for.
    expect(screen.queryByRole('region', { name: 'What it’s for' })).toBeNull();
    expect(screen.queryByText('Echoes a message back.')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { level: 2, name: 'Result' });
  });

  it('names a workflow’s failed run as the workflow’s', async () => {
    const api = makeApi();
    api.callTool = jest.fn(() =>
      Promise.reject(new Error('workflow echo is not available')),
    );
    api.describeTool = jest.fn(() =>
      Promise.resolve({ ...detail, inputSchema: undefined }),
    );
    await renderPanel(api, undefined, {
      name: 'workflow_echo',
      subject: 'workflow',
    });

    expect(
      await screen.findByText('This workflow takes no inputs.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(
      await screen.findByText('Could not run the workflow'),
    ).toBeInTheDocument();
  });

  it('renders the described tool and its argument form', async () => {
    const api = makeApi();
    await renderPanel(api);

    // Headed as the agent, skill and workflow pages head theirs.
    expect(
      within(
        await screen.findByRole('region', { name: 'What it’s for' }),
      ).getByText('Echoes a message back.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Try it' }),
    ).toBeInTheDocument();
    // Folded: the form is the schema drawn for people. Mounted only once
    // opened, as the other pages' Technical details are.
    expect(
      screen.getByRole('button', { name: 'Input schema' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/"What to echo"/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /message/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Input schema' }));
    expect(await screen.findByText(/"What to echo"/)).toBeInTheDocument();
  });

  it('says so when the connector gives the tool no description', async () => {
    const api = makeApi();
    api.describeTool = jest.fn(() =>
      Promise.resolve({ ...detail, description: undefined }),
    );
    await renderPanel(api);

    expect(
      within(
        await screen.findByRole('region', { name: 'What it’s for' }),
      ).getByText('Its connector gives no description.'),
    ).toBeInTheDocument();
  });

  it('executes the tool and shows the result', async () => {
    const api = makeApi();
    await renderPanel(api);

    await screen.findByText('Echoes a message back.');
    await userEvent.type(
      screen.getByRole('textbox', { name: /message/i }),
      'hi',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(api.callTool).toHaveBeenCalledWith(
        'core_echo',
        expect.objectContaining({ message: 'hi' }),
        undefined,
      ),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Result' }),
    ).toBeInTheDocument();
  });

  it('keeps the last result on screen while a re-run is pending', async () => {
    const api = makeApi();
    await renderPanel(api);

    await screen.findByText('Echoes a message back.');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Result' }),
    ).toBeInTheDocument();

    (api.callTool as jest.Mock).mockImplementation(() => new Promise(() => {}));
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(
      await screen.findByRole('button', { name: /Running/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Result' }),
    ).toBeInTheDocument();
  });

  it('drops the last result when a call fails', async () => {
    const api = makeApi();
    await renderPanel(api);

    await screen.findByText('Echoes a message back.');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { level: 2, name: 'Result' });

    (api.callTool as jest.Mock).mockRejectedValue(new Error('boom'));
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(
      await screen.findByText('Could not run the tool'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Result' }),
    ).toBeNull();
  });

  it('shows a note beside the Run button when given one', async () => {
    await renderPanel(makeApi(), 'Nothing is changed.');

    await screen.findByText('Echoes a message back.');
    expect(screen.getByText('Nothing is changed.')).toBeInTheDocument();
  });
});
