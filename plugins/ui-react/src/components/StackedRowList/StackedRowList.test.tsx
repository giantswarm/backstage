import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CellText, ColumnConfig, Table } from '@backstage/ui';
import { usePhoneLayout } from '../../utils/breakpoints';
import {
  mockDesktopLayout,
  MockedLayout,
  mockPhoneLayout,
} from '../../testUtils/mockPhoneLayout';
import { ShowMore } from '../ShowMore';
import { StackedRowItem, StackedRowList } from './StackedRowList';

type Session = {
  id: string;
  title: string;
  agent: string;
  state: string;
  environment?: string;
  started: string;
};

const threeSessions: Session[] = [
  {
    id: 's1',
    title: 'Why is the ingress on gazelle returning 504s?',
    agent: 'incident-helper',
    state: 'Done',
    environment: 'gazelle',
    started: '3 min ago',
  },
  {
    id: 's2',
    title: 'Upgrade cert-manager',
    agent: 'platform-ops',
    state: 'Needs input',
    started: 'yesterday',
  },
  {
    id: 's3',
    title: 'Summarise open PRs',
    agent: 'reviewer',
    state: 'Running',
    environment: 'gazelle',
    started: '2 days ago',
  },
];

// A fleet's worth: long snake_case titles, mixed states, some without an
// environment.
const manySessions: Session[] = Array.from({ length: 300 }, (_, index) => ({
  id: `s${index}`,
  title: `rotate_cluster_certificates_for_workload_cluster_${index}`,
  agent: index % 2 ? 'platform-ops' : 'incident-helper',
  state: ['Done', 'Running', 'Needs input', 'Failed'][index % 4],
  environment: index % 5 === 0 ? undefined : 'gazelle',
  started: `${index + 1} min ago`,
}));

const toRow =
  (onMore: (id: string) => void) =>
  (session: Session): StackedRowItem => ({
    id: session.id,
    title: session.title,
    href: `/sessions/${session.id}`,
    status: <span>{session.state}</span>,
    facts: [session.agent, session.environment, session.started],
    actions: (
      <button
        type="button"
        aria-label={`More actions for ${session.title}`}
        onClick={() => onMore(session.id)}
      >
        ⋯
      </button>
    ),
  });

describe('StackedRowList', () => {
  let layout: MockedLayout | undefined;
  afterEach(() => {
    layout?.restore();
    layout = undefined;
  });

  it('renders three rows: title link, status, facts and actions', () => {
    render(
      <StackedRowList
        aria-label="Sessions"
        rows={threeSessions.map(toRow(jest.fn()))}
      />,
    );

    const list = screen.getByRole('list', { name: 'Sessions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    const first = within(rows[0]);
    expect(
      first.getByRole('link', {
        name: 'Why is the ingress on gazelle returning 504s?',
      }),
    ).toHaveAttribute('href', '/sessions/s1');
    expect(first.getByText('Done')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('incident-helper·gazelle·3 min ago');
    expect(
      first.getByRole('button', {
        name: 'More actions for Why is the ingress on gazelle returning 504s?',
      }),
    ).toBeInTheDocument();
  });

  it('drops a missing fact without leaving a dangling separator', () => {
    render(
      <StackedRowList
        aria-label="Sessions"
        rows={threeSessions.map(toRow(jest.fn()))}
      />,
    );

    const second = screen.getAllByRole('listitem')[1];
    expect(second).toHaveTextContent('platform-ops·yesterday');
    expect(second).not.toHaveTextContent('··');
  });

  it('keeps the actions pressable apart from the row link', async () => {
    const onMore = jest.fn();
    render(
      <StackedRowList
        aria-label="Sessions"
        rows={threeSessions.map(toRow(onMore))}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', {
        name: 'More actions for Upgrade cert-manager',
      }),
    );
    expect(onMore).toHaveBeenCalledWith('s2');
  });

  it('renders a row without href as plain text, and details under the facts', () => {
    render(
      <StackedRowList
        aria-label="Served models"
        rows={[
          {
            id: 'llama',
            title: 'llama3.1-8b-instruct',
            facts: ['vLLM', '1 GPU'],
            details: 'Waiting for a GPU node.',
          },
        ]}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('llama3.1-8b-instruct')).toBeInTheDocument();
    expect(screen.getByText('Waiting for a GPU node.')).toBeInTheDocument();
  });

  it('shows the empty state instead of an empty list', () => {
    render(
      <StackedRowList
        aria-label="Sessions"
        rows={[]}
        emptyState={<p>No sessions yet.</p>}
      />,
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('No sessions yet.')).toBeInTheDocument();
  });

  it('pages 300 rows through ShowMore, every row with its actions', async () => {
    render(
      <ShowMore items={manySessions} noun="session">
        {visible => (
          <StackedRowList
            aria-label="Sessions"
            rows={visible.map(toRow(jest.fn()))}
          />
        )}
      </ShowMore>,
    );

    const list = () => screen.getByRole('list', { name: 'Sessions' });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(20);
    expect(
      within(list()).getAllByRole('button', { name: /^More actions for / }),
    ).toHaveLength(20);
    // The first row without an environment has two facts, not three.
    expect(within(list()).getAllByRole('listitem')[0]).toHaveTextContent(
      'incident-helper·1 min ago',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more sessions' }),
    );
    expect(within(list()).getAllByRole('listitem')).toHaveLength(40);
  });

  describe('as the phone layout of a table', () => {
    const columns: ColumnConfig<Session>[] = [
      {
        id: 'title',
        label: 'Session',
        isRowHeader: true,
        cell: s => <CellText title={s.title} />,
      },
      { id: 'agent', label: 'Agent', cell: s => <CellText title={s.agent} /> },
      { id: 'state', label: 'State', cell: s => <CellText title={s.state} /> },
    ];

    function Sessions({ sessions }: { sessions: Session[] }) {
      const isPhone = usePhoneLayout();
      return isPhone ? (
        <StackedRowList
          aria-label="Sessions"
          rows={sessions.map(toRow(jest.fn()))}
        />
      ) : (
        <Table
          columnConfig={columns}
          data={sessions}
          pagination={{ type: 'none' }}
        />
      );
    }

    it('is a list on a phone', () => {
      layout = mockPhoneLayout();
      render(<Sessions sessions={threeSessions} />);

      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
      expect(
        within(screen.getByRole('list', { name: 'Sessions' })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(3);
    });

    it('is a table on a desktop', () => {
      layout = mockDesktopLayout();
      render(<Sessions sessions={threeSessions} />);

      expect(
        screen.queryByRole('list', { name: 'Sessions' }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    });
  });
});
