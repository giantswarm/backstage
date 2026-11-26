import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { renderInTestApp as renderInBackstage } from '@backstage/frontend-test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { musterApiRef, type MusterApi, type ToolSummary } from '../../../apis';
import { mcpServersRouteRef } from '../../../routes';
import type { NoToolsExplanation } from '../../McpServersPage/serverDetail';
import { ConnectorToolsTab } from './ConnectorToolsTab';

/** The tab as a page renders it: inside the query client its grants read with. */
const renderInTestApp: typeof renderInBackstage = (element, options) =>
  renderInBackstage(
    <QueryClientProvider client={new QueryClient()}>
      {element}
    </QueryClientProvider>,
    options,
  );

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

function renderTab(
  tools: ToolSummary[],
  path = '/connector',
  tone: NoToolsExplanation['tone'] = 'neutral',
) {
  return renderInTestApp(
    <>
      <ConnectorToolsTab
        server="jira"
        installation="gazelle"
        tools={{
          tools,
          truncated: false,
          isLoading: false,
          shortName: name => name.replace(/^x_jira_/, ''),
        }}
        emptyExplanation={{ text: 'No tools.', tone }}
      />
      <LocationProbe />
    </>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/customize/connectors': mcpServersRouteRef },
    },
  );
}

const location = () => screen.getByRole('status', { name: 'Location' });

/** A tool's page as far as these tests go: its name and the browser's Back. */
function ToolPageProbe() {
  const { tool } = useParams();
  const navigate = useNavigate();
  return (
    <>
      <p>Page of {tool}</p>
      <button type="button" onClick={() => navigate(-1)}>
        Browser back
      </button>
    </>
  );
}

/** The tab on the connector's address, with a tool's page beneath it. */
function renderRoundTrip(tools: ToolSummary[]) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/customize/connectors/gazelle/jira"
        element={
          <ConnectorToolsTab
            server="jira"
            installation="gazelle"
            tools={{
              tools,
              truncated: false,
              isLoading: false,
              shortName: name => name.replace(/^x_jira_/, ''),
            }}
            emptyExplanation={{ text: 'No tools.', tone: 'neutral' }}
          />
        }
      />
      <Route
        path="/customize/connectors/gazelle/jira/tools/:tool"
        element={<ToolPageProbe />}
      />
    </Routes>,
    {
      initialRouteEntries: ['/customize/connectors/gazelle/jira'],
      mountedRoutes: { '/customize/connectors': mcpServersRouteRef },
    },
  );
}

const toolRows = () => screen.getAllByRole('link', { name: /^tool_\d+/ });

describe('ConnectorToolsTab', () => {
  it('shows why a failed connector lists no tools as a warning', async () => {
    await renderTab([], '/connector', 'warning');

    expect(
      screen.getByText('No tools.').closest('[data-status]'),
    ).toHaveAttribute('data-status', 'warning');
  });

  it('says plainly why a connector that did not fail lists no tools', async () => {
    await renderTab([]);

    expect(screen.getByText('No tools.').closest('[data-status]')).toBeNull();
  });

  it('links each tool to its page, with its description and what it does', async () => {
    await renderTab(makeTools(3));

    const list = screen.getByRole('list', { name: 'Tools' });
    const [first] = within(list).getAllByRole('listitem');
    expect(
      within(first).getByRole('link', { name: 'tool_000' }),
    ).toHaveAttribute(
      'href',
      '/customize/connectors/gazelle/jira/tools/x_jira_tool_000',
    );
    expect(within(first).getByText('Tool number 0')).toBeInTheDocument();
    expect(within(first).getByText('Reads')).toBeInTheDocument();
    // The form and the result live on the tool's page, not in the list.
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it("carries the search in force into a tool's link, for the way back", async () => {
    await renderTab(makeTools(300));

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search tools' }),
      'tool_299',
    );
    expect(toolRows()[0]).toHaveAttribute(
      'href',
      '/customize/connectors/gazelle/jira/tools/x_jira_tool_299?q=tool_299',
    );
  });

  it("carries the effect filter into a tool's link, and opens on the filter the address names", async () => {
    await renderTab(makeTools(300), '/connector?effect=changes');

    // Every third tool reads: 200 change things, a page of them shown.
    expect(toolRows()).toHaveLength(20);
    expect(screen.getByText('20 tools shown, 180 more')).toBeInTheDocument();
    expect(toolRows()[0]).toHaveAttribute(
      'href',
      '/customize/connectors/gazelle/jira/tools/x_jira_tool_001?effect=changes',
    );
  });

  it("lands Back from a tool's page on the search, filter and page it was opened from", async () => {
    await renderRoundTrip(makeTools(300));

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search tools' }),
      'tool_',
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Filter by what it does/ }),
    );
    await userEvent.click(
      screen.getByRole('option', { name: 'Changes things 200' }),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more tools' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more tools' }),
    );
    // The 55th tool that changes things.
    await userEvent.click(screen.getByRole('link', { name: 'tool_082' }));
    expect(
      await screen.findByText('Page of x_jira_tool_082'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(
      await screen.findByRole('searchbox', { name: 'Search tools' }),
    ).toHaveValue('tool_');
    expect(
      screen.getByRole('button', { name: /Filter by what it does/ }),
    ).toHaveTextContent(/Changes things/);
    expect(toolRows()).toHaveLength(60);
    expect(screen.getByRole('link', { name: 'tool_082' })).toBeInTheDocument();
  });

  it('lists two tools plainly: no search, no filter, no reveal control', async () => {
    await renderTab(makeTools(2));

    expect(toolRows()).toHaveLength(2);
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
    expect(screen.queryByRole('link', { name: /^tool_001/ })).toBeNull();
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
    await renderTab(makeTools(300), '/connector?q=tool_29');

    expect(screen.getByRole('searchbox', { name: 'Search tools' })).toHaveValue(
      'tool_29',
    );
    // tool_290 to tool_299.
    expect(toolRows()).toHaveLength(10);
  });

  it('does not write its search into the address', async () => {
    await renderTab(makeTools(300), '/connector?q=tool_29');

    // Each change of the address is a page view.
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search tools' }),
      '9',
    );
    expect(toolRows()).toHaveLength(1);
    expect(location()).toHaveTextContent('?q=tool_29');
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

describe('ConnectorToolsTab: tool approval', () => {
  /** Ten tools as muster reports them on a reviewed connector. */
  function reviewedTools(admin = true): ToolSummary[] {
    return makeTools(10).map((tool, i) => {
      let approval: ToolSummary['approval'] = {
        setting: 'allow',
        source: 'tool',
      };
      if (i % 3 !== 0) {
        approval = { setting: 'ask', source: 'tool' };
      }
      if (i === 9) {
        approval = { setting: 'ask', source: 'connector', new: true };
      }
      return { ...tool, approval, connectorAdmin: admin };
    });
  }

  function renderApprovalTab(
    tools: ToolSummary[],
    props: Partial<React.ComponentProps<typeof ConnectorToolsTab>> = {},
  ) {
    return renderInTestApp(
      <ConnectorToolsTab
        server="jira"
        installation="gazelle"
        tools={{
          tools,
          truncated: false,
          isLoading: false,
          shortName: name => name.replace(/^x_jira_/, ''),
        }}
        emptyExplanation={{ text: 'No tools.', tone: 'neutral' }}
        settingsHref="/customize/connectors/gazelle/jira/edit/verify"
        {...props}
      />,
      {
        initialRouteEntries: ['/connector'],
        mountedRoutes: { '/customize/connectors': mcpServersRouteRef },
      },
    );
  }

  const row = (name: string) =>
    screen.getByText(name).closest('li') as HTMLElement;

  it('shows each tool’s setting, where it comes from and the New marker, read-only', async () => {
    await renderApprovalTab(reviewedTools());

    expect(within(row('tool_000')).getByText('Allow')).toBeInTheDocument();
    expect(
      within(row('tool_000')).getByText('Set for this tool'),
    ).toBeInTheDocument();
    expect(within(row('tool_001')).getByText('Ask')).toBeInTheDocument();
    expect(within(row('tool_009')).getByText('New')).toBeInTheDocument();
    expect(
      within(row('tool_009')).getByText("Connector's rule"),
    ).toBeInTheDocument();
    // The tab only reads: the settings change in the connector's edit.
    expect(screen.queryByRole('radio')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Change tool settings' }),
    ).toHaveAttribute('href', '/customize/connectors/gazelle/jira/edit/verify');
  });

  it('says that tools added later are hidden when the rule is Block', async () => {
    await renderApprovalTab(reviewedTools(), { newToolsRule: 'Block' });

    expect(screen.getByText('Block for new tools')).toBeInTheDocument();
  });

  it('lists the tools the connector blocks, apart and with no page to open', async () => {
    await renderApprovalTab(reviewedTools(), {
      blockedTools: ['x_jira_delete_project'],
    });

    const blocked = row('delete_project');
    expect(within(blocked).getByText('Block')).toBeInTheDocument();
    expect(
      within(blocked).getByText(/Hidden from everyone/),
    ).toBeInTheDocument();
    expect(within(blocked).queryByRole('link')).toBeNull();
    // A blocked badge never reads like Ask: its own tone and icon.
    expect(within(blocked).getByText('Block').className).not.toBe(
      within(row('tool_001')).getByText('Ask').className,
    );
  });

  it('counts a blocked row under no effect, as it shows none', async () => {
    await renderApprovalTab(reviewedTools(), {
      blockedTools: ['x_jira_delete_project'],
    });

    await userEvent.click(
      screen.getByRole('button', { name: /Filter by what it does/ }),
    );
    const counts = within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .map(option => option.textContent);
    const total = counts
      .map(text => Number(/(\d+)$/.exec(text ?? '')?.[1] ?? 0))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(reviewedTools().length);
  });

  it('filters by approval', async () => {
    await renderApprovalTab(reviewedTools(), {
      blockedTools: ['x_jira_delete_project'],
    });

    const approval = screen.getByRole('button', { name: /Filter by approval/ });
    await userEvent.click(approval);
    expect(
      within(await screen.findByRole('listbox'))
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual(['Allow 3', 'Ask 7', 'Block 1']);
    await userEvent.click(screen.getByRole('option', { name: 'Block 1' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('delete_project')).toBeInTheDocument();
    expect(screen.queryByText('tool_001')).toBeNull();
  });

  it('says a connector nobody reviewed allows everything, and leads its admin to review it', async () => {
    const unreviewed = makeTools(4).map(tool => ({
      ...tool,
      approval: { setting: 'allow' as const, source: 'unreviewed' as const },
      connectorAdmin: true,
    }));
    await renderApprovalTab(unreviewed);

    expect(screen.getByText('Allow — not reviewed')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review tool settings' }),
    ).toHaveAttribute('href', '/customize/connectors/gazelle/jira/edit/verify');
    // Said once above the list, not on every row.
    expect(screen.queryByText('Not reviewed')).toBeNull();
  });

  it("says a just-created connector (its create's rule alone) is not reviewed, without a New on every row", async () => {
    // As muster reports a create's preset: every tool follows the rule, New.
    const created = makeTools(4).map(tool => ({
      ...tool,
      approval: {
        setting: 'ask' as const,
        source: 'connector' as const,
        new: true,
      },
      connectorAdmin: true,
    }));
    await renderApprovalTab(created);

    expect(screen.getByText('Ask — not reviewed')).toBeInTheDocument();
    expect(
      screen.getByText(/Every tool asks first until its settings are reviewed/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review tool settings' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('New')).toBeNull();
    expect(screen.queryByText("Connector's rule")).toBeNull();
  });

  it('offers no review to a person who is not a connector admin', async () => {
    const unreviewed = makeTools(4).map(tool => ({
      ...tool,
      approval: { setting: 'allow' as const, source: 'unreviewed' as const },
      connectorAdmin: false,
    }));
    await renderApprovalTab(unreviewed);

    expect(screen.getByText('Allow — not reviewed')).toBeInTheDocument();
    expect(
      screen.getByText(/A connector admin can review them\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tool settings/ })).toBeNull();
  });

  it('points a GitOps-managed connector to Git', async () => {
    const unreviewed = makeTools(2).map(tool => ({
      ...tool,
      approval: { setting: 'allow' as const, source: 'unreviewed' as const },
      connectorAdmin: true,
    }));
    await renderApprovalTab(unreviewed, {
      settingsHref: undefined,
      settingsInGit: true,
    });

    expect(screen.getByText(/spec\.approval/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tool settings/ })).toBeNull();
  });

  it('says why calls are refused when muster cannot read the settings', async () => {
    const unavailable = makeTools(2).map(tool => ({
      ...tool,
      approval: { setting: 'ask' as const, source: 'unavailable' as const },
    }));
    await renderApprovalTab(unavailable);

    expect(
      screen.getByText("The tool settings can't be read"),
    ).toBeInTheDocument();
    // What muster does: the tools report Ask and calls do not run.
    expect(
      screen.getByText(/reports every tool as Ask and does not run them/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/refuses calls/)).toBeNull();
  });

  it("warns with muster's reason where approvals cannot be answered, beside the settings", async () => {
    const refused = makeTools(2).map(tool => ({
      ...tool,
      approval: {
        setting: 'ask' as const,
        source: 'connector' as const,
        unavailable: 'muster runs no browser sign-in',
      },
    }));
    await renderApprovalTab(refused);

    expect(
      screen.getByText("Approvals can't be answered right now"),
    ).toBeInTheDocument();
    expect(screen.getByText(/runs no browser sign-in/)).toBeInTheDocument();
    expect(screen.queryByText("The tool settings can't be read")).toBeNull();
    expect(screen.getAllByText('Ask').length).toBeGreaterThan(0);
  });

  it('shows no approval where muster reports none (an older muster)', async () => {
    await renderApprovalTab(makeTools(2));

    expect(screen.queryByText('Allow')).toBeNull();
    expect(screen.queryByText(/not reviewed/)).toBeNull();
    expect(screen.queryByRole('link', { name: /tool settings/ })).toBeNull();
  });
});

describe('ConnectorToolsTab: Allowed for', () => {
  it("names the agents that may skip a tool's Ask, read from agent-manager's grants", async () => {
    const callTool = jest.fn(
      async (name: string, args: Record<string, unknown>) => {
        if (name === 'x_agent-manager_get_info') {
          return { namespaces: { managed: ['kagent', 'org-a'] } };
        }
        return {
          grants:
            args.namespace === 'org-a'
              ? [
                  {
                    agent: { namespace: 'org-a', name: 'alert-review' },
                    entry: 'tool:x_jira_close',
                    server: 'jira',
                    grantedBy: 'dana@example.com',
                  },
                  {
                    agent: { namespace: 'org-a', name: 'triage' },
                    entry: 'server:jira',
                    server: 'jira',
                  },
                ]
              : [],
        };
      },
    );
    await renderInTestApp(
      <ConnectorToolsTab
        server="jira"
        installation="gazelle"
        tools={{
          tools: [
            {
              name: 'x_jira_close',
              server: 'jira',
              approval: { setting: 'ask', source: 'tool' },
            },
            {
              name: 'x_jira_list',
              server: 'jira',
              approval: { setting: 'allow', source: 'tool' },
            },
          ],
          truncated: false,
          isLoading: false,
          shortName: name => name.replace(/^x_jira_/, ''),
        }}
        emptyExplanation={{ text: 'No tools.', tone: 'neutral' }}
      />,
      {
        initialRouteEntries: ['/connector'],
        mountedRoutes: { '/customize/connectors': mcpServersRouteRef },
        apis: [[musterApiRef, { callTool } as unknown as MusterApi]],
      },
    );
    expect(
      await screen.findByText(
        'Allowed for: alert-review (by dana@example.com)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Allowed for every asking tool its exception covers: triage/,
      ),
    ).toBeInTheDocument();
    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_list_approval_grants',
      { namespace: 'org-a', server: 'jira' },
      'gazelle',
    );
  });
});
