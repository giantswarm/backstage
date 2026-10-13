import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { musterApiRef } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import { ServerPrompts, ServerResources } from './serverDetail';

function makeServer(spec: Record<string, unknown> = {}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'pro' },
      spec: {
        type: 'streamable-http',
        url: 'https://pro.example/mcp',
        ...spec,
      },
      status: { state: 'Connected' },
    } as never,
    'gazelle',
  );
}

async function render(
  element: JSX.Element,
  musterApi: Record<string, unknown>,
) {
  // A per-test client so one test's cache never satisfies another's query.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('ServerResources', () => {
  it('scopes the request to the server rather than to a URI pattern', async () => {
    // Resource URIs carry a scheme and are exposed unprefixed, so there is no
    // `x_<server>_*` to match on the way there is for tools -- the server name
    // is the only reliable scope (muster#1096).
    const filterResources = jest.fn().mockResolvedValue({
      total: 1,
      filtered_count: 1,
      truncated: false,
      resources: [
        {
          uri: 'roadmap://schema',
          name: 'Roadmap Field Schema',
          description: 'Read this first to discover valid field names.',
          server: 'pro',
        },
      ],
    });

    await render(<ServerResources server={makeServer()} />, {
      filterResources,
    });

    expect(await screen.findByText('roadmap://schema')).toBeInTheDocument();
    expect(filterResources).toHaveBeenCalledWith({
      installation: 'gazelle',
      server: 'pro',
      limit: 200,
    });
  });

  it('distinguishes an empty result from a broken one', async () => {
    const filterResources = jest.fn().mockResolvedValue({
      total: 0,
      filtered_count: 0,
      truncated: false,
      resources: [],
    });

    await render(<ServerResources server={makeServer()} />, {
      filterResources,
    });

    // An unauthenticated session sees an empty catalogue for a server it never
    // logged in to, so "none" must not be stated as fact.
    expect(await screen.findByText(/No resources exposed/)).toBeInTheDocument();
    expect(
      screen.getByText(/may be down or require authentication/),
    ).toBeInTheDocument();
  });

  it('surfaces a failure instead of rendering an empty list', async () => {
    const filterResources = jest
      .fn()
      .mockRejectedValue(new Error('muster unreachable'));

    await render(<ServerResources server={makeServer()} />, {
      filterResources,
    });

    expect(
      await screen.findByText(/Resources unavailable: muster unreachable/),
    ).toBeInTheDocument();
  });
});

describe('ServerPrompts', () => {
  it('strips the server prefix from prompt names', async () => {
    const filterPrompts = jest.fn().mockResolvedValue({
      total: 1,
      filtered_count: 1,
      truncated: false,
      prompts: [
        {
          name: 'x_pro_triage_issue',
          description: 'Triage an issue.',
          server: 'pro',
        },
      ],
    });

    await render(<ServerPrompts server={makeServer()} />, { filterPrompts });

    expect(await screen.findByText('triage_issue')).toBeInTheDocument();
    expect(screen.queryByText(/prompt\(s\)/)).toBeNull();
    const row = within(screen.getByRole('list', { name: 'Prompts' })).getByRole(
      'listitem',
    );
    expect(within(row).getByText('Triage an issue.')).toBeInTheDocument();
    expect(filterPrompts).toHaveBeenCalledWith({
      installation: 'gazelle',
      server: 'pro',
      limit: 200,
    });
  });

  it('strips the toolPrefix, not the family name, for a family server', async () => {
    // Family grouping feeds the *tool* prefix; muster exposes prompts as
    // `x_<toolPrefix>_<name>` regardless of family, so using the tool prefix
    // here would leave the name unstripped.
    const filterPrompts = jest.fn().mockResolvedValue({
      total: 1,
      filtered_count: 1,
      truncated: false,
      prompts: [
        { name: 'x_k8s_describe_pod', description: 'Describe.', server: 'pro' },
      ],
    });

    await render(
      <ServerPrompts
        server={makeServer({
          family: { name: 'kubernetes' },
          toolPrefix: 'k8s',
        })}
      />,
      { filterPrompts },
    );

    expect(await screen.findByText('describe_pod')).toBeInTheDocument();
  });

  it('distinguishes an empty result from a broken one', async () => {
    const filterPrompts = jest.fn().mockResolvedValue({
      total: 0,
      filtered_count: 0,
      truncated: false,
      prompts: [],
    });

    await render(<ServerPrompts server={makeServer()} />, { filterPrompts });

    expect(await screen.findByText(/No prompts exposed/)).toBeInTheDocument();
  });
});

describe('resource and prompt lists at scale', () => {
  const resources = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      uri: `doc://item-${index + 1}`,
      name: `Item ${index + 1}`,
      server: 'pro',
    }));
  const prompts = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      name: `x_pro_prompt_${index + 1}`,
      description: index === 249 ? 'The needle.' : 'A prompt.',
      server: 'pro',
    }));

  it('lists three resources with no search and no reveal control', async () => {
    const filterResources = jest.fn().mockResolvedValue({
      total: 3,
      filtered_count: 3,
      truncated: false,
      resources: resources(3),
    });

    await render(<ServerResources server={makeServer()} />, {
      filterResources,
    });

    expect(await screen.findByText('doc://item-3')).toBeInTheDocument();
    // The tab carries the count; the list repeats none of its own.
    expect(screen.queryByText(/resource\(s\)/)).toBeNull();
    expect(
      within(screen.getByRole('list', { name: 'Resources' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(3);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pages 200 of 300 resources twenty at a time, saying the list is partial', async () => {
    const filterResources = jest.fn().mockResolvedValue({
      total: 300,
      filtered_count: 200,
      truncated: true,
      resources: resources(200),
    });

    await render(<ServerResources server={makeServer()} />, {
      filterResources,
    });

    expect(await screen.findByText('doc://item-20')).toBeInTheDocument();
    expect(screen.queryByText('doc://item-21')).toBeNull();
    expect(screen.getAllByText(/^doc:\/\/item-/)).toHaveLength(20);
    expect(
      screen.getByText(
        'This list may be incomplete: muster returned only part of the resources.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show 20 more resources' }),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search resources' }),
      'item-150',
    );
    expect(screen.getAllByText(/^doc:\/\/item-/)).toHaveLength(1);
    expect(screen.getByText('doc://item-150')).toBeInTheDocument();
  });

  it('lists three prompts with no search and no reveal control', async () => {
    const filterPrompts = jest.fn().mockResolvedValue({
      total: 3,
      filtered_count: 3,
      truncated: false,
      prompts: prompts(3),
    });

    await render(<ServerPrompts server={makeServer()} />, { filterPrompts });

    expect(await screen.findByText('prompt_3')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pages 300 prompts twenty at a time and searches them', async () => {
    const filterPrompts = jest.fn().mockResolvedValue({
      total: 300,
      filtered_count: 300,
      truncated: false,
      prompts: prompts(300),
    });

    await render(<ServerPrompts server={makeServer()} />, { filterPrompts });

    expect(await screen.findByText('prompt_20')).toBeInTheDocument();
    expect(screen.getAllByText(/^prompt_\d+$/)).toHaveLength(20);
    expect(screen.getByText('20 prompts shown, 280 more')).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search prompts' }),
      'needle',
    );
    expect(screen.getAllByText(/^prompt_\d+$/)).toHaveLength(1);
    expect(screen.getByText('prompt_250')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
  });
});
