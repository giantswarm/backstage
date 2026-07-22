import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef, ToolDetail } from '../../apis';
import { ToolDetailPanel } from './ToolDetailPanel';

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

async function renderPanel(api: Pick<MusterApi, 'describeTool' | 'callTool'>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <ToolDetailPanel
          name="core_echo"
          isFavourite={false}
          onToggleFavourite={jest.fn()}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('ToolDetailPanel', () => {
  it('renders the described tool and its argument form', async () => {
    const api = makeApi();
    await renderPanel(api);

    expect(await screen.findByText('core_echo')).toBeInTheDocument();
    expect(screen.getByText('Echoes a message back.')).toBeInTheDocument();
    expect(screen.getByText('Arguments')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /message/i }),
    ).toBeInTheDocument();
  });

  it('executes the tool and shows the result', async () => {
    const api = makeApi();
    await renderPanel(api);

    await screen.findByText('core_echo');
    await userEvent.type(
      screen.getByRole('textbox', { name: /message/i }),
      'hi',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Execute' }));

    await waitFor(() =>
      expect(api.callTool).toHaveBeenCalledWith(
        'core_echo',
        expect.objectContaining({ message: 'hi' }),
        undefined,
      ),
    );
    expect(await screen.findByText('Result')).toBeInTheDocument();
  });
});
