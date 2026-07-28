import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionRow } from '../SessionsDataProvider/helpers';
import { SessionsTable } from './SessionsTable';

const mockBuildAvatarUrl = jest.fn(
  (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
);

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuildAvatarUrl,
}));

const rows: SessionRow[] = [
  {
    id: 'gazelle/abc',
    installation: 'gazelle',
    title: 'What issues are assi...',
    agentName: 'Issue tracker',
    agentTechnicalName: 'issue-tracker',
    createdAt: '2026-07-23T16:04:28.586641Z',
    updatedAt: '2026-07-23T16:09:58.162014Z',
  },
  {
    id: 'golem/def',
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
  });

  it('renders every column header', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />);

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

  it('renders session titles as kagent supplied them', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />);

    // kagent truncates to 20 chars, so the ellipsis is real data, not ours.
    expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
    // The fallback for a session kagent never titled.
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('seeds the avatar from the resolved agent’s technical name', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />);

    expect(mockBuildAvatarUrl).toHaveBeenCalledWith(
      'gazelle',
      'issue-tracker',
      {
        size: 48,
      },
    );
  });

  it('shows a dash where a value is unknown', async () => {
    await renderInTestApp(<SessionsTable rows={[rows[1]]} />);

    // Missing agent, missing created/updated timestamps: three dashes. Explicit
    // because DateComponent renders null for a falsy value, which would leave the
    // cell blank.
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('renders the empty state when there are no rows', async () => {
    await renderInTestApp(<SessionsTable rows={[]} />);

    expect(screen.getByText('No sessions found.')).toBeInTheDocument();
  });

  it('shows a skeleton rather than the empty state while loading', async () => {
    // The `data={undefined}` gotcha: passing `[]` would render "No sessions
    // found." before the first rows arrive.
    await renderInTestApp(<SessionsTable rows={[]} isLoading />);

    expect(screen.queryByText('No sessions found.')).not.toBeInTheDocument();
  });

  describe('search', () => {
    it('filters by session title', async () => {
      await renderInTestApp(<SessionsTable rows={rows} searchDebounceMs={0} />);

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'issues',
      );

      expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    });

    it('filters by agent name', async () => {
      await renderInTestApp(<SessionsTable rows={rows} searchDebounceMs={0} />);

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'tracker',
      );

      expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    });

    it('shows the empty state when nothing matches', async () => {
      await renderInTestApp(<SessionsTable rows={rows} searchDebounceMs={0} />);

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'nothing matches this',
      );

      expect(screen.getByText('No sessions found.')).toBeInTheDocument();
    });
  });
});
