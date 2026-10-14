import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { ToolSummary } from '../../../apis';
import { ConnectorToolsTab } from './ConnectorToolsTab';

/** Every third tool reads; the rest change things. */
function makeTools(count: number): ToolSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `x_jira_tool_${String(i).padStart(3, '0')}`,
    summary: `Tool number ${i}`,
    ...(i % 3 === 0 ? { annotations: { readOnlyHint: true } } : {}),
  }));
}

/** The address the tab leaves, so a test can read its `?q=`. */
function LocationProbe() {
  const { search } = useLocation();
  return <output aria-label="Location">{search}</output>;
}

function renderTab(tools: ToolSummary[], path = '/connector') {
  return renderInTestApp(
    <>
      <ConnectorToolsTab
        installation="gazelle"
        tools={{
          tools,
          truncated: false,
          isLoading: false,
          shortName: name => name.replace(/^x_jira_/, ''),
        }}
        runsAsCaller
        emptyExplanation="No tools."
      />
      <LocationProbe />
    </>,
    { initialRouteEntries: [path] },
  );
}

const location = () => screen.getByRole('status', { name: 'Location' });

const toolRows = () => screen.getAllByRole('button', { name: /^tool_\d+/ });

describe('ConnectorToolsTab', () => {
  it('lists three tools plainly: no search, no filter, no reveal control', async () => {
    await renderTab(makeTools(3));

    expect(toolRows()).toHaveLength(3);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Filter by what it does/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /more|fewer/i })).toBeNull();
  });

  it('pages 300 tools and offers search and the effect filter', async () => {
    await renderTab(makeTools(300));

    expect(toolRows()).toHaveLength(20);
    expect(screen.getByText('20 tools shown, 280 more')).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Search tools' }),
    ).toHaveAttribute('placeholder', 'Search 300 tools');
    const effect = screen.getByRole('button', {
      name: /Filter by what it does/,
    });
    await userEvent.click(effect);
    expect(
      within(await screen.findByRole('listbox'))
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual(['Reads 100', 'Changes things 200']);
    await userEvent.keyboard('{Escape}');

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more tools' }),
    );
    expect(toolRows()).toHaveLength(40);

    // A filter change starts over from its first page.
    await userEvent.click(effect);
    await userEvent.click(screen.getByRole('option', { name: 'Reads 100' }));
    await userEvent.keyboard('{Escape}');
    expect(toolRows()).toHaveLength(20);
    expect(screen.getByText('20 tools shown, 80 more')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^tool_001/ })).toBeNull();
  });

  it('has no effect dropdown when every tool does the same', async () => {
    await renderTab(
      makeTools(10).map(tool => ({
        ...tool,
        annotations: { readOnlyHint: true },
      })),
    );

    expect(
      screen.getByRole('searchbox', { name: 'Search tools' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Filter by what it does/ }),
    ).toBeNull();
  });

  it('searches the whole list, not just the page shown', async () => {
    await renderTab(makeTools(300));

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search tools' }),
      'tool_299',
    );
    expect(toolRows()).toHaveLength(1);
    expect(screen.queryByText(/shown/)).toBeNull();
  });

  it('opens on the tools the address searches for', async () => {
    await renderTab(
      makeTools(300),
      '/connector?installation=gazelle&q=tool_29',
    );

    expect(screen.getByRole('searchbox', { name: 'Search tools' })).toHaveValue(
      'tool_29',
    );
    // tool_290 to tool_299.
    expect(toolRows()).toHaveLength(10);
  });

  it('does not write its search into the address', async () => {
    await renderTab(
      makeTools(300),
      '/connector?installation=gazelle&q=tool_29',
    );

    // Each change of the address is a page view.
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search tools' }),
      '9',
    );
    expect(toolRows()).toHaveLength(1);
    expect(location()).toHaveTextContent('?installation=gazelle&q=tool_29');
    expect(location()).not.toHaveTextContent('tool_299');
  });

  it('shows a short list its search, and keeps the field once cleared', async () => {
    await renderTab(makeTools(3), '/connector?q=tool_001');

    expect(toolRows().map(row => row.textContent)).toEqual([
      expect.stringContaining('tool_001'),
    ]);
    await userEvent.clear(
      screen.getByRole('searchbox', { name: 'Search tools' }),
    );
    expect(toolRows()).toHaveLength(3);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
});
