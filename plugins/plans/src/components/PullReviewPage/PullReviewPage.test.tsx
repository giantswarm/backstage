import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlansApi, plansApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { PullReviewPage } from './PullReviewPage';

const REPO = 'giantswarm/plans';
const PULL_NUMBER = 42;
const BRANCH = 'plans/fullscreen';
const FILE = 'docs/fullscreen.md';
const CONTENT = '# Full screen\n\nFirst paragraph.\n\nSecond paragraph.\n';

function createPlansApi(): jest.Mocked<PlansApi> {
  return {
    getConnection: jest.fn().mockResolvedValue({ connected: true }),
    listRepos: jest.fn().mockResolvedValue({ repositories: [REPO] }),
    listPulls: jest.fn().mockResolvedValue({
      pulls: [
        {
          number: PULL_NUMBER,
          title: 'Add a full-screen mode to the review page',
          author: 'someone',
          draft: false,
          branch: BRANCH,
          updatedAt: '2026-09-17T09:00:00Z',
          body: 'The description.',
        },
      ],
    }),
    listPullFiles: jest.fn().mockResolvedValue({
      files: [
        {
          filename: FILE,
          status: 'modified',
          additions: 2,
          deletions: 1,
          patch: '@@ -1 +1,2 @@\n-# Old\n+# Full screen\n+\n',
        },
      ],
    }),
    getTree: jest.fn().mockResolvedValue({ truncated: false, tree: [] }),
    listEpics: jest.fn().mockResolvedValue({ merged: [], pulls: [] }),
    getContent: jest
      .fn()
      .mockResolvedValue({ path: FILE, ref: BRANCH, content: CONTENT }),
    listPullComments: jest.fn().mockResolvedValue({ comments: [] }),
    createPullComment: jest.fn(),
    listReviewComments: jest.fn().mockResolvedValue({ comments: [] }),
    createReviewComment: jest.fn(),
  };
}

/**
 * Renders the review page at a document URL, the way PlansRouter mounts it
 * under the plans root. A fresh QueryClient per test keeps the module-level
 * cache of PlansProviders out of the picture.
 */
async function renderPage() {
  const plansApi = createPlansApi();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <TestApiProvider apis={[[plansApiRef, plansApi]]}>
        <PullReviewPage />
      </TestApiProvider>
    </QueryClientProvider>,
    {
      mountedRoutes: { '/plans': rootRouteRef },
      mountPath: '/plans/pr/:number',
      initialRouteEntries: [
        `/plans/pr/${PULL_NUMBER}?repo=${encodeURIComponent(
          REPO,
        )}&doc=${encodeURIComponent(FILE)}`,
      ],
    },
  );
  // The document toolbar is up once the file list and the pull are loaded.
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Full screen' }),
    ).toBeInTheDocument(),
  );
}

describe('PullReviewPage', () => {
  it('offers full screen beside the GitHub link and leaves it from the same button', async () => {
    const user = userEvent.setup();
    await renderPage();

    expect(
      screen.getByRole('link', { name: /^View on GitHub/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Full screen' }));

    expect(
      screen.getByRole('button', { name: 'Exit full screen' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Full screen' }),
    ).not.toBeInTheDocument();
    // The document itself is still the one being read.
    expect(
      screen.getByRole('heading', { name: 'Full screen' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Exit full screen' }));

    expect(
      screen.getByRole('button', { name: 'Full screen' }),
    ).toBeInTheDocument();
  });

  it('leaves full screen on Escape', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(
      screen.getByRole('button', { name: 'Exit full screen' }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(
      screen.getByRole('button', { name: 'Full screen' }),
    ).toBeInTheDocument();
  });

  it('keeps the reader mounted, so an open comment draft survives entering and leaving full screen', async () => {
    const user = userEvent.setup();
    await renderPage();

    // Heading on line 1, first paragraph on line 3.
    await user.click(screen.getByLabelText('Comment on line 3'));
    await user.type(screen.getByPlaceholderText('Comment on line 3'), 'Draft');

    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(screen.getByPlaceholderText('Comment on line 3')).toHaveValue(
      'Draft',
    );

    await user.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(screen.getByPlaceholderText('Comment on line 3')).toHaveValue(
      'Draft',
    );
  });
});
