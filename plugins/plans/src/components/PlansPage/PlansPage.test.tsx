import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlansApi, plansApiRef } from '../../apis';
import { PlansPage } from './PlansPage';

// The tabs and the header slot stand in: this test is about which
// repository the team picks and whether a picker appears.
jest.mock('../ProposedTab', () => ({
  ProposedTab: ({ repo }: { repo: string }) => <p>Proposed in {repo}</p>,
}));
jest.mock('../MergedTab', () => ({
  MergedTab: () => null,
}));
const mockHeaderActions = jest.fn();
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  useProvidePageHeaderActions: (actions: unknown) => mockHeaderActions(actions),
}));

/** The repository picker the page put into the header last, if any. */
const headerPicker = () => mockHeaderActions.mock.calls.at(-1)?.[0] ?? null;

const REPOSITORIES = [
  'giantswarm/bumblebee-plans',
  'giantswarm/honeybadger-plans',
];

async function renderAt(search: string) {
  const plansApi = {
    listRepos: jest.fn(async () => ({ repositories: REPOSITORIES })),
  } as unknown as PlansApi;
  mockHeaderActions.mockClear();
  await renderInTestApp(
    <TestApiProvider apis={[[plansApiRef, plansApi]]}>
      <QueryClientProvider client={new QueryClient()}>
        <PlansPage />
      </QueryClientProvider>
    </TestApiProvider>,
    { initialRouteEntries: [`/${search}`] },
  );
}

describe('PlansPage', () => {
  it("shows the chosen team's plans repository", async () => {
    await renderAt(`?team=${encodeURIComponent('Honey Badger 🦡')}`);
    expect(
      await screen.findByText('Proposed in giantswarm/honeybadger-plans'),
    ).toBeInTheDocument();
    expect(headerPicker()).toBeNull();
  });

  it('says so when the team has no plans repository', async () => {
    await renderAt(`?team=${encodeURIComponent('Phoenix 🔥')}`);
    expect(
      await screen.findByText('Team Phoenix has no plans here'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Proposed in/)).not.toBeInTheDocument();
  });

  it('starts all teams on the first repository', async () => {
    await renderAt('?team=all');
    expect(
      await screen.findByText('Proposed in giantswarm/bumblebee-plans'),
    ).toBeInTheDocument();
    expect(headerPicker()).not.toBeNull();
  });
});
