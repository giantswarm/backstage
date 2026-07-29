import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionRow } from '../SessionsDataProvider/helpers';
import { sessionsRouteRef } from '../../routes';
import { SessionsTable } from './SessionsTable';

const mockBuildAvatarUrl = jest.fn(
  (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
);

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuildAvatarUrl,
}));

// The row's programmatic navigation, and *only* it: `Link` resolves `useNavigate`
// internally within react-router-dom, so its own client-side navigation is
// untouched by this mock. A call here therefore means the row handler ran.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const rows: SessionRow[] = [
  {
    id: 'gazelle/abc',
    sessionId: 'abc',
    installation: 'gazelle',
    title: 'What issues are assi...',
    agentName: 'Issue tracker',
    agentTechnicalName: 'issue-tracker',
    createdAt: '2026-07-23T16:04:28.586641Z',
    updatedAt: '2026-07-23T16:09:58.162014Z',
  },
  {
    id: 'golem/def',
    sessionId: 'def',
    installation: 'golem',
    title: 'Chat',
    agentName: '',
    createdAt: undefined,
    updatedAt: undefined,
  },
];

describe('SessionsTable', () => {
  beforeEach(() => {
    mockBuildAvatarUrl.mockClear();
    mockNavigate.mockClear();
  });

  it('renders every column header', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    for (const header of [
      'Session',
      'Agent',
      'Installation',
      'Started',
      'Last activity',
    ]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });

  it('links each row to its session, carrying both installation and id', async () => {
    // A real anchor, not only a row click: an anchor is what makes cmd- and
    // middle-click open a new tab and gives keyboard users something focusable.
    // Both path segments are needed because kagent ids are only unique within an
    // installation.
    await renderInTestApp(<SessionsTable rows={rows} />, {
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(
      screen.getByRole('link', { name: 'What issues are assi...' }),
    ).toHaveAttribute('href', '/agent-platform/sessions/gazelle/abc');
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute(
      'href',
      '/agent-platform/sessions/golem/def',
    );
  });

  describe('navigation', () => {
    // The row's onClick is react-aria's `onAction`, which fires for a press
    // anywhere in the row — the anchor included. Both firing for one click
    // navigated twice: two identical history entries, so Back needed two presses,
    // and with a modifier held the session opened in a new tab *and* took the
    // current one with it.
    it('does not also navigate the row when the title link is clicked', async () => {
      await renderInTestApp(<SessionsTable rows={rows} />, {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      });

      await userEvent.click(
        screen.getByRole('link', { name: 'What issues are assi...' }),
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('still navigates the row when a modifier key is held on the link', async () => {
      // The browser opens the anchor in a new tab and react-router stays out of
      // the way; the row must stay out of the way too, or the current tab is
      // navigated away from the list the user wanted to keep.
      await renderInTestApp(<SessionsTable rows={rows} />, {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      });

      await userEvent.keyboard('{Meta>}');
      await userEvent.click(
        screen.getByRole('link', { name: 'What issues are assi...' }),
      );
      await userEvent.keyboard('{/Meta}');

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates when a cell other than the title is clicked', async () => {
      // The whole-row click is the convenience affordance and must keep working.
      await renderInTestApp(<SessionsTable rows={rows} />, {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      });

      await userEvent.click(screen.getByText('Issue tracker'));

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith(
        '/agent-platform/sessions/gazelle/abc',
      );
    });
  });

  it('renders session titles as kagent supplied them', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    // kagent truncates to 20 chars, so the ellipsis is real data, not ours.
    expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
    // The fallback for a session kagent never titled.
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('seeds the avatar from the resolved agent’s technical name', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(mockBuildAvatarUrl).toHaveBeenCalledWith(
      'gazelle',
      'issue-tracker',
      {
        size: 48,
      },
    );
  });

  it('shows a dash where a value is unknown', async () => {
    await renderInTestApp(<SessionsTable rows={[rows[1]]} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    // Missing agent, missing created/updated timestamps: three dashes. Explicit
    // because DateComponent renders null for a falsy value, which would leave the
    // cell blank.
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('renders the empty state when there are no rows', async () => {
    await renderInTestApp(<SessionsTable rows={[]} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(screen.getByText('No sessions found.')).toBeInTheDocument();
  });

  it('shows a skeleton rather than the empty state while loading', async () => {
    // The `data={undefined}` gotcha: passing `[]` would render "No sessions
    // found." before the first rows arrive.
    await renderInTestApp(<SessionsTable rows={[]} isLoading />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(screen.queryByText('No sessions found.')).not.toBeInTheDocument();
  });

  describe('search', () => {
    it('filters by session title', async () => {
      await renderInTestApp(
        <SessionsTable rows={rows} searchDebounceMs={0} />,
        {
          // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
          // SubRouteRef — and the detail sub-route resolves relative to it.
          mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
        },
      );

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'issues',
      );

      expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    });

    it('filters by agent name', async () => {
      await renderInTestApp(
        <SessionsTable rows={rows} searchDebounceMs={0} />,
        {
          // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
          // SubRouteRef — and the detail sub-route resolves relative to it.
          mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
        },
      );

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'tracker',
      );

      expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    });

    it('shows the empty state when nothing matches', async () => {
      await renderInTestApp(
        <SessionsTable rows={rows} searchDebounceMs={0} />,
        {
          // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
          // SubRouteRef — and the detail sub-route resolves relative to it.
          mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
        },
      );

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'nothing matches this',
      );

      expect(screen.getByText('No sessions found.')).toBeInTheDocument();
    });
  });
});
