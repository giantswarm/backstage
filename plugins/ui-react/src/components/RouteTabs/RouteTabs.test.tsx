import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { RouteTabs, RouteTabSpec } from './RouteTabs';

const TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'run', path: 'run', title: 'Run' },
  { id: 'executions', path: 'executions', title: 'Executions', count: 3 },
];

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/workflows/:name/*"
          element={<RouteTabs tabs={TABS} search="?installation=gazelle" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RouteTabs', () => {
  it('links every tab absolutely below the page, keeping the query string', () => {
    renderAt('/workflows/deploy/run');

    expect(
      screen
        .getAllByRole('tab')
        .map(tab => [tab.textContent, tab.getAttribute('href')]),
    ).toEqual([
      ['Overview', '/workflows/deploy?installation=gazelle'],
      ['Run', '/workflows/deploy/run?installation=gazelle'],
      ['Executions (3)', '/workflows/deploy/executions?installation=gazelle'],
    ]);
  });

  it('selects the tab of the current route', () => {
    renderAt('/workflows/deploy/executions');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Executions (3)',
    );
  });

  it('builds the hrefs from an explicit base path when the page is part of the splat', () => {
    render(
      <MemoryRouter initialEntries={['/skills/acme/skills/nested/dir/run']}>
        <Routes>
          <Route
            path="/skills/*"
            element={
              <RouteTabs
                tabs={TABS}
                basePath="/skills/acme/skills/nested/dir"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getAllByRole('tab').map(tab => tab.getAttribute('href')),
    ).toEqual([
      '/skills/acme/skills/nested/dir',
      '/skills/acme/skills/nested/dir/run',
      '/skills/acme/skills/nested/dir/executions',
    ]);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Run',
    );
  });

  it('selects the index only at the page itself', () => {
    renderAt('/workflows/deploy');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Overview',
    );
  });
});
