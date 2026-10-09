import { useMemo } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import { ShellPage } from './ShellPage';

function RegistersAction({ label }: { label: string }) {
  const actions = useMemo(() => <button>{label}</button>, [label]);
  useProvidePageHeaderActions(actions);
  return null;
}

function renderAt(url: string, element: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PageHeaderActionsProvider>
        <Routes>
          <Route path="/connectors/:name/*" element={element} />
        </Routes>
      </PageHeaderActionsProvider>
    </MemoryRouter>,
  );
}

describe('ShellPage', () => {
  it('renders breadcrumbs, the h1, its badge row and the content', () => {
    renderAt(
      '/connectors/jira',
      <ShellPage
        title="Jira"
        breadcrumbs={[
          { label: 'Customize', href: '/customize' },
          { label: 'Connectors', href: '/customize/connectors' },
          { label: 'Jira' },
        ]}
        leading={<span data-testid="tile">J</span>}
        badges={<span>Connected</span>}
        meta="Search, read and update tickets"
        description="A connector to the support desk."
        footer={<p>Footer</p>}
      >
        <p>Tools content</p>
      </ShellPage>,
    );

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(crumbs).getByRole('link', { name: 'Customize' }),
    ).toHaveAttribute('href', '/customize');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Jira' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tile')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(
      screen.getByText('Search, read and update tickets'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A connector to the support desk.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Tools content')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('renders its own actions, then the registered ones, then the menu', () => {
    renderAt(
      '/connectors/jira',
      <>
        <ShellPage
          title="Jira"
          actions={<button>Edit</button>}
          menu={<button>More actions</button>}
        />
        <RegistersAction label="Test connection" />
      </>,
    );

    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual([
      'Edit',
      'Test connection',
      'More actions',
    ]);
  });

  it('draws routed tabs below the page, keeping the query string', () => {
    renderAt(
      '/connectors/jira/settings',
      <ShellPage
        title="Jira"
        tabsSearch="?installation=gazelle"
        tabs={[
          { id: 'tools', path: '', title: 'Tools' },
          { id: 'used-by', path: 'used-by', title: 'Used by' },
          { id: 'settings', path: 'settings', title: 'Settings' },
        ]}
      />,
    );

    expect(
      screen
        .getAllByRole('tab')
        .map(tab => [tab.textContent, tab.getAttribute('href')]),
    ).toEqual([
      ['Tools', '/connectors/jira?installation=gazelle'],
      ['Used by', '/connectors/jira/used-by?installation=gazelle'],
      ['Settings', '/connectors/jira/settings?installation=gazelle'],
    ]);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Settings',
    );
  });

  it('renders the aside beside the content and leaves out what is not given', () => {
    renderAt(
      '/connectors/jira',
      <ShellPage title="Jira" aside={<aside aria-label="Details" />}>
        <p>Body</p>
      </ShellPage>,
    );

    expect(
      screen.getByRole('complementary', { name: 'Details' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
