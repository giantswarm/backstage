import { screen, waitFor } from '@testing-library/react';
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

  it('renders the tool’s argument form, leaving what it is for to Overview', async () => {
    const api = makeApi();
    await renderPanel(api);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Try it' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /message/i }),
    ).toBeInTheDocument();
    // The tool page's Overview says what it is for and shows the schema.
    expect(screen.queryByRole('region', { name: 'What it’s for' })).toBeNull();
    expect(screen.queryByText('Echoes a message back.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Input schema' })).toBeNull();
  });

  it('keeps a workflow’s input schema folded above its inputs', async () => {
    const api = makeApi();
    await renderPanel(api, undefined, {
      name: 'workflow_echo',
      subject: 'workflow',
    });

    // Mounted only once opened, as the other pages' Technical details are.
    expect(
      await screen.findByRole('button', { name: 'Input schema' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/"What to echo"/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Input schema' }));
    expect(await screen.findByText(/"What to echo"/)).toBeInTheDocument();
  });

  it('executes the tool and shows the result', async () => {
    const api = makeApi();
    await renderPanel(api);

    await screen.findByRole('heading', { level: 2, name: 'Try it' });
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

    await screen.findByRole('heading', { level: 2, name: 'Try it' });
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

    await screen.findByRole('heading', { level: 2, name: 'Try it' });
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

    await screen.findByRole('heading', { level: 2, name: 'Try it' });
    expect(screen.getByText('Nothing is changed.')).toBeInTheDocument();
  });

  describe('argument validation', () => {
    // Earlier runs remember their arguments.
    beforeEach(() => window.localStorage.clear());

    const validated: ToolDetail = {
      ...detail,
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'What to echo' },
          spec: { type: 'object', description: 'A JSON object' },
        },
        required: ['message'],
      },
    };

    it('marks the missing argument on Run, focuses it, and runs nothing', async () => {
      const api = makeApi();
      api.describeTool = jest.fn(() => Promise.resolve(validated));
      await renderPanel(api);

      await userEvent.click(await screen.findByRole('button', { name: 'Run' }));

      const message = screen.getByRole('textbox', { name: /^message/ });
      expect(message).toHaveAttribute('aria-invalid', 'true');
      expect(message).toHaveAccessibleDescription(
        expect.stringContaining('Enter a value for message.'),
      );
      expect(message).toHaveFocus();
      expect(api.callTool).not.toHaveBeenCalled();

      await userEvent.type(message, 'hi');
      expect(message).not.toHaveAttribute('aria-invalid');
    });

    it('focuses the item that is wrong in a list argument', async () => {
      const api = makeApi();
      api.describeTool = jest.fn(() =>
        Promise.resolve({
          ...detail,
          inputSchema: {
            type: 'object',
            properties: {
              counts: { type: 'array', items: { type: 'integer' } },
            },
          },
        }),
      );
      await renderPanel(api);
      const add = await screen.findByRole('button', { name: 'Add item' });
      await userEvent.click(add);
      await userEvent.click(add);
      await userEvent.type(
        screen.getByRole('textbox', { name: 'counts item 1' }),
        '3',
      );
      await userEvent.type(
        screen.getByRole('textbox', { name: 'counts item 2' }),
        'x',
      );

      await userEvent.click(screen.getByRole('button', { name: 'Run' }));

      const second = screen.getByRole('textbox', { name: 'counts item 2' });
      expect(second).toHaveFocus();
      expect(second).toHaveAttribute('aria-invalid', 'true');
      expect(second).toHaveAccessibleDescription(
        expect.stringContaining('Item 2: Enter a number'),
      );
      expect(api.callTool).not.toHaveBeenCalled();
    });

    it('checks an argument when the person leaves it, not while they type', async () => {
      const api = makeApi();
      api.describeTool = jest.fn(() => Promise.resolve(validated));
      await renderPanel(api);

      const spec = await screen.findByRole('textbox', { name: /^spec/ });
      await userEvent.type(spec, 'not json');
      expect(spec).not.toHaveAttribute('aria-invalid');

      await userEvent.tab();
      expect(spec).toHaveAttribute('aria-invalid', 'true');
      expect(spec).toHaveAccessibleDescription(
        expect.stringContaining('Enter valid JSON'),
      );
    });
  });
});
