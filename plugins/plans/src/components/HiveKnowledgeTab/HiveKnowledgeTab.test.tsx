import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { PlansApi, plansApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { HiveKnowledgeTab } from './HiveKnowledgeTab';

jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    render: jest.fn(async (id: string, source: string) => {
      if (!source.startsWith('graph')) {
        throw new Error(
          'No diagram type detected matching given configuration',
        );
      }
      return { svg: `<svg id="${id}"><g class="node"></g></svg>` };
    }),
  },
}));

function knowledgeApi(document: string) {
  return {
    getMagazine: jest.fn(async () => ({
      configured: true,
      repository: 'giantswarm/magazine',
      ref: 'data',
      knowledgeRef: 'main',
    })),
    getTree: jest.fn(async () => ({
      tree: [{ path: 'knowledge/architecture/flow.md', type: 'blob' }],
    })),
    getContent: jest.fn(async () => ({ content: document })),
  } as unknown as PlansApi;
}

describe('HiveKnowledgeTab', () => {
  afterEach(() => focusManager.setFocused(undefined));

  async function renderCollection(documents: Record<string, string>) {
    const plansApi = {
      getMagazine: jest.fn(async () => ({
        configured: true,
        repository: 'giantswarm/magazine',
        ref: 'data',
        knowledgeRef: 'main',
      })),
      getTree: jest.fn(async () => ({
        tree: Object.keys(documents).map(path => ({ path, type: 'blob' })),
      })),
      getContent: jest.fn(async (path: string) => ({
        content: documents[path],
      })),
    } as unknown as PlansApi;
    await renderInTestApp(
      <TestApiProvider apis={[[plansApiRef, plansApi]]}>
        <QueryClientProvider client={new QueryClient()}>
          <HiveKnowledgeTab />
        </QueryClientProvider>
      </TestApiProvider>,
      {
        mountedRoutes: { '/hive': rootRouteRef },
        initialRouteEntries: [
          '/hive/knowledge?team=Bumblebee&doc=knowledge%2Fproduct%2Fagent-platform.md',
        ],
      },
    );
    return plansApi;
  }

  it('opens inline sibling and cross-directory documents while retaining the team', async () => {
    const user = userEvent.setup();
    await renderCollection({
      'knowledge/product/agent-platform.md':
        '# Agent Platform\n\n[Slack agent](slack-agent.md)',
      'knowledge/product/slack-agent.md':
        '# Slack agent\n\n[Architect](../architecture/architect.md)',
      'knowledge/architecture/architect.md':
        '# Architect\n\n[Architect orb](architect-orb.md)',
      'knowledge/architecture/architect-orb.md':
        '# Architect orb\n\nOrb documentation.',
    });

    const article = await screen.findByRole('article', {
      name: 'Agent platform',
    });
    const slackLink = await within(article).findByRole('link', {
      name: 'Slack agent',
    });
    expect(slackLink).toHaveAttribute(
      'href',
      expect.stringContaining('team=Bumblebee'),
    );
    await user.click(slackLink);
    const slack = await screen.findByRole('article', { name: 'Slack agent' });
    await user.click(
      await within(slack).findByRole('link', { name: 'Architect' }),
    );
    const architect = await screen.findByRole('article', { name: 'Architect' });
    await user.click(
      await within(architect).findByRole('link', { name: 'Architect orb' }),
    );
    expect(await screen.findByText('Orb documentation.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Architect orb', current: 'page' }),
    ).toHaveAttribute('href', expect.stringContaining('team=Bumblebee'));
  });

  it('shows a missing document instead of silently selecting the first document', async () => {
    const user = userEvent.setup();
    const plansApi = await renderCollection({
      'knowledge/product/agent-platform.md':
        '# Agent Platform\n\n[Missing](missing.md)',
    });

    await user.click(await screen.findByRole('link', { name: 'Missing' }));
    expect(
      await screen.findByText('Knowledge document not found'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'Agent platform' }),
    ).toBeNull();
    expect(plansApi.getContent).not.toHaveBeenCalledWith(
      'knowledge/product/missing.md',
      expect.anything(),
      expect.anything(),
    );
  });

  it('shows its progress bar while the retry after a 500 waits, then the document', async () => {
    // A background tab: react-query pauses the retry until it is focused,
    // and the query stays pending without fetching (`isLoading` is false).
    focusManager.setFocused(false);
    const plansApi = {
      getMagazine: jest.fn(async () => ({
        configured: true,
        repository: 'giantswarm/magazine',
        ref: 'data',
        knowledgeRef: 'main',
      })),
      getTree: jest
        .fn()
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockResolvedValue({
          tree: [{ path: 'knowledge/product/hive.md', type: 'blob' }],
        }),
      getContent: jest.fn(async () => ({
        content: 'The magazine of the hive.',
      })),
    } as unknown as PlansApi;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });

    await renderInTestApp(
      <TestApiProvider apis={[[plansApiRef, plansApi]]}>
        <QueryClientProvider client={client}>
          <HiveKnowledgeTab />
        </QueryClientProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/plans': rootRouteRef } },
    );

    // The first read failed and its retry waits for the tab.
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ fetchStatus: 'paused' }),
      ).not.toHaveLength(0),
    );
    expect(screen.getByTestId('progress')).toBeInTheDocument();

    act(() => focusManager.setFocused(true));

    expect(
      await screen.findByText('The magazine of the hive.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No knowledge documents yet')).toBeNull();
  });

  it('renders a document’s Mermaid blocks as diagrams, an invalid one as its source with a note', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [
            plansApiRef,
            knowledgeApi(
              [
                '# Flow',
                '',
                '```mermaid',
                'graph TD',
                '  A --> B',
                '```',
                '',
                '```mermaid',
                'not a diagram',
                '```',
              ].join('\n'),
            ),
          ],
        ]}
      >
        <QueryClientProvider client={new QueryClient()}>
          <HiveKnowledgeTab />
        </QueryClientProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/plans': rootRouteRef } },
    );

    const article = await screen.findByRole('article', { name: 'Flow' });
    await waitFor(() =>
      expect(
        within(article).getByTestId('mermaid-diagram').querySelector('svg'),
      ).not.toBeNull(),
    );
    expect(within(article).queryByText(/A --> B/)).toBeNull();
    expect(await within(article).findByRole('note')).toHaveTextContent(
      'No diagram type detected',
    );
    expect(within(article).getByText('not a diagram')).toBeInTheDocument();
  });
});
