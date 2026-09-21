import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rootRouteRef } from '../../routes';
import { PlanPullRow } from './helpers';
import { ProposedPlansTable } from './ProposedPlansTable';

// The chip queries the roadmap backend for the epic's board item. This test is
// about the table, so it stands in for it -- but it still renders what the
// requested variant renders, so the column's content stays asserted here.
jest.mock('../EpicChip', () => ({
  EpicChip: ({
    epic,
    variant,
  }: {
    epic: { number: number };
    variant?: 'badge' | 'link';
  }) => (
    <span>
      {variant === 'link' ? `#${epic.number}` : `Epic #${epic.number}`}
    </span>
  ),
}));

// The batched catalog lookup behind the author avatars. The table's job is to
// ask for the right logins and render what comes back, so the profiles are
// supplied directly here.
// Declared before the mock that closes over it: `jest.mock` is hoisted above
// this line, but its factory only runs when the module is first required, by
// which time this is initialised.
const mockProfileLogins = jest.fn();

jest.mock('./useAuthorProfiles', () => ({
  // Only the lookup is stubbed; `userEntityRef` stays real, so the ref the
  // table builds is the one that ships.
  ...jest.requireActual('./useAuthorProfiles'),
  useAuthorProfiles: (logins: (string | undefined)[]) => {
    mockProfileLogins(logins);
    return new Map([
      [
        'marians',
        {
          displayName: 'Marian Steinbach',
          picture: 'https://avatars.example/marians.png',
        },
      ],
    ]);
  },
}));

// `UserEntityLink` resolves the person through the catalog. The table only has
// to hand it the right entity ref and the profile it looked up, so the resolved
// name stands in as the ref itself -- what the real component falls back to
// when the catalog has no such user.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  UserEntityLink: ({
    entityRef,
    displayName,
    picture,
  }: {
    entityRef: string;
    displayName?: string;
    picture?: string;
  }) => (
    <a href={`/catalog/${entityRef}`} data-picture={picture}>
      {displayName ?? entityRef}
    </a>
  ),
}));

// The row's programmatic navigation, and *only* it: `Link` resolves
// `useNavigate` internally within react-router-dom, so its own client-side
// navigation is untouched by this mock. A call here therefore means the row
// handler ran.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const rows: PlanPullRow[] = [
  {
    id: 412,
    number: 412,
    title: 'Agent Platform model cache',
    author: 'marians',
    draft: true,
    updatedAt: '2026-09-18T09:00:00Z',
    body: '',
  },
  {
    id: 408,
    number: 408,
    title: 'Muster tool explorer rework',
    author: undefined,
    draft: false,
    updatedAt: '2026-09-15T09:00:00Z',
    body: '',
  },
  {
    id: 401,
    number: 401,
    title: 'Roadmap epic cross-links',
    author: 'QuentinBisson',
    draft: false,
    updatedAt: undefined,
    body: '',
    epic: {
      owner: 'giantswarm',
      repo: 'roadmap',
      number: 4321,
      url: 'https://github.com/giantswarm/roadmap/issues/4321',
    },
  },
];

// Only the parent RouteRef is mountable -- `mountedRoutes` rejects a
// SubRouteRef -- and the review sub-route resolves relative to it.
const mountedRoutes = { '/plans': rootRouteRef };

const renderTable = () =>
  renderInTestApp(<ProposedPlansTable rows={rows} repo="giantswarm/plans" />, {
    mountedRoutes,
  });

/** The rendered titles, in the order the table put the rows in. */
const renderedTitles = () =>
  screen.getAllByRole('rowheader').map(cell => cell.textContent);

describe('ProposedPlansTable', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders every column header', async () => {
    await renderTable();

    for (const header of [
      'PR',
      'Author',
      'Status',
      'Last updated',
      'Title',
      'Epic',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: header }),
      ).toBeInTheDocument();
    }
  });

  it('shows the pull number and the epic number per row', async () => {
    await renderTable();

    expect(screen.getByText('#412')).toBeInTheDocument();
    // The column heading already says "Epic", so the cell is just the number.
    expect(screen.getByText('#4321')).toBeInTheDocument();
    expect(screen.queryByText(/Epic #/)).not.toBeInTheDocument();
  });

  it('asks the catalog only about the logins it has', async () => {
    // One batched lookup for the table, not one request per row -- and the row
    // without an author contributes nothing to ask about.
    await renderTable();

    expect(mockProfileLogins).toHaveBeenCalledWith([
      'marians',
      undefined,
      'QuentinBisson',
    ]);
  });

  it("hands the author's looked-up profile to the link", async () => {
    // The photo itself cannot be asserted here -- bui's Avatar only renders its
    // initials fallback in jsdom, because the image never loads -- so this
    // pins the table's half of the job: the profile reaches the component.
    await renderTable();

    const link = screen.getByRole('link', { name: 'Marian Steinbach' });
    expect(link).toHaveAttribute(
      'data-picture',
      'https://avatars.example/marians.png',
    );
  });

  it('points the author at their catalog User entity', async () => {
    // The GitHub login is the catalog User's name, so the login is all the ref
    // needs; the entity supplies the display name and the photo.
    await renderTable();

    expect(
      screen.getByRole('link', { name: 'Marian Steinbach' }),
    ).toHaveAttribute('href', '/catalog/user:default/marians');
    // A mixed-case GitHub login: the ref has to be lower-cased, because the
    // catalog indexes refs in lower case and would otherwise match nothing --
    // leaving the person as a bare login with no photo.
    expect(
      screen.getByRole('link', { name: 'user:default/quentinbisson' }),
    ).toBeInTheDocument();
  });

  it('leaves the author blank when the pull request has none', async () => {
    await renderTable();

    // #408 has no author; a dash, not a link to `user:default/undefined`.
    expect(
      screen.queryByRole('link', { name: /user:default\/(undefined|)$/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('\u2014')).toHaveLength(2);
  });

  it('marks only the draft', async () => {
    // Every row here is an open pull request, so only the draft is worth
    // saying; a badge on all the others would carry no information.
    await renderTable();

    expect(screen.getAllByText('Draft')).toHaveLength(1);
  });

  it('links each title to its review page, carrying the repository', async () => {
    await renderTable();

    expect(
      screen.getByRole('link', { name: 'Agent Platform model cache' }),
    ).toHaveAttribute('href', '/plans/pr/412?repo=giantswarm%2Fplans');
  });

  describe('order', () => {
    it('starts with the most recently updated plan', async () => {
      await renderTable();

      expect(renderedTitles()).toEqual([
        'Agent Platform model cache',
        'Muster tool explorer rework',
        // No `updatedAt` at all: last, because unknown is not oldest.
        'Roadmap epic cross-links',
      ]);
    });

    it('re-sorts when a column header is clicked', async () => {
      // The one assertion that catches a sort which has silently stopped
      // working -- a missing `sortFn`, or `data` passed after `tableProps`,
      // both leave the table rendering the unsorted rows without complaint.
      const user = userEvent.setup();
      await renderTable();

      await user.click(screen.getByRole('columnheader', { name: 'PR' }));

      expect(renderedTitles()).toEqual([
        'Roadmap epic cross-links',
        'Muster tool explorer rework',
        'Agent Platform model cache',
      ]);
    });
  });

  describe('navigation', () => {
    it('navigates when a cell other than the title is clicked', async () => {
      const user = userEvent.setup();
      await renderTable();

      // The draft badge: in #412's row, and not itself a link.
      await user.click(screen.getByText('Draft'));

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith(
        '/plans/pr/412?repo=giantswarm%2Fplans',
      );
    });

    it('does not also navigate the row when the title link is clicked', async () => {
      // Both firing for one click navigated twice: two identical history
      // entries, so Back needed two presses.
      const user = userEvent.setup();
      await renderTable();

      await user.click(
        screen.getByRole('link', { name: 'Agent Platform model cache' }),
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('still leaves the row alone when a modifier key is held on the link', async () => {
      // The browser opens the anchor in a new tab and react-router stays out of
      // the way; the row must too, or the current tab is navigated away from the
      // list the user wanted to keep.
      const user = userEvent.setup();
      await renderTable();

      await user.keyboard('{Meta>}');
      await user.click(
        screen.getByRole('link', { name: 'Agent Platform model cache' }),
      );
      await user.keyboard('{/Meta}');

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
