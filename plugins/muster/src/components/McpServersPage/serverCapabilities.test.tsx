import { screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { musterApiRef } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import { ServerPrompts, ServerResources } from './serverDetail';

function makeServer(): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'pro' },
      spec: { type: 'streamable-http', url: 'https://pro.example/mcp' },
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
        { name: 'x_pro_triage_issue', description: 'Triage an issue.' },
      ],
    });

    await render(<ServerPrompts server={makeServer()} />, { filterPrompts });

    expect(await screen.findByText('triage_issue')).toBeInTheDocument();
    expect(filterPrompts).toHaveBeenCalledWith({
      installation: 'gazelle',
      server: 'pro',
      limit: 200,
    });
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
