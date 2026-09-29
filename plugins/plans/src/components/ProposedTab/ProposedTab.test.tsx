import { useState } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlansApi, PlansPullsResponse, plansApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { ProposedTab } from './ProposedTab';

// The Author column reaches for the catalog (a display name, a photo). This
// test is about which repository's rows are on screen, so it stands in.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  UserEntityLink: ({ entityRef }: { entityRef: string }) => (
    <span>{entityRef}</span>
  ),
}));

jest.mock('../ProposedPlansTable/useAuthorProfiles', () => ({
  ...jest.requireActual('../ProposedPlansTable/useAuthorProfiles'),
  useAuthorProfiles: () => new Map(),
}));

const PULLS: Record<string, PlansPullsResponse> = {
  'giantswarm/first-plans': {
    pulls: [
      {
        number: 11,
        title: 'A plan in the first repository',
        author: 'marians',
        draft: false,
        updatedAt: '2026-09-18T09:00:00Z',
        body: '',
      },
    ],
  },
  'giantswarm/second-plans': {
    pulls: [
      {
        number: 22,
        title: 'A plan in the second repository',
        author: 'marians',
        draft: false,
        updatedAt: '2026-09-17T09:00:00Z',
        body: '',
      },
    ],
  },
};

/** Resolves only when released, so the loading window can be inspected. */
function deferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>(resolve => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * Switches repository from inside the tree. A `rerender` from outside would
 * drop the test app's Router, and `useRouteRef` would throw.
 */
function RepoSwitcher() {
  const [repo, setRepo] = useState('giantswarm/first-plans');
  return (
    <>
      <button type="button" onClick={() => setRepo('giantswarm/second-plans')}>
        switch repo
      </button>
      <ProposedTab repo={repo} />
    </>
  );
}

describe('ProposedTab', () => {
  it('does not keep the previous repository’s plans on screen while the next load', async () => {
    // bui's `useTable` keeps the last non-empty rows in a ref and falls back to
    // them whenever `data` is undefined, and with the `data` form it never
    // returns itself to its pending state -- so an unkeyed table would show the
    // first repository's plans, at full opacity, with links already carrying
    // the second repository. A click would open the wrong plan.
    const second = deferred<PlansPullsResponse>();
    const plansApi = {
      listPulls: jest.fn(async (repo?: string) =>
        repo === 'giantswarm/second-plans'
          ? second.promise
          : PULLS[repo as string],
      ),
      listEpics: jest.fn(async () => ({ merged: [], pulls: [] })),
    } as unknown as PlansApi;

    const user = userEvent.setup();
    await renderInTestApp(
      <TestApiProvider apis={[[plansApiRef, plansApi]]}>
        <QueryClientProvider client={new QueryClient()}>
          <RepoSwitcher />
        </QueryClientProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/plans': rootRouteRef } },
    );

    expect(
      await screen.findByText('A plan in the first repository'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'switch repo' }));

    // Still loading the second repository: the first one's plan must be gone.
    await waitFor(() =>
      expect(
        screen.queryByText('A plan in the first repository'),
      ).not.toBeInTheDocument(),
    );

    second.release(PULLS['giantswarm/second-plans']);
    expect(
      await screen.findByText('A plan in the second repository'),
    ).toBeInTheDocument();
  });
});
