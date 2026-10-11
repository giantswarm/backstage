import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderTab(tools: ToolSummary[]) {
  return renderInTestApp(
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
    />,
  );
}

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
});
