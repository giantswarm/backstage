import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { mockPhoneLayout } from '@giantswarm/backstage-plugin-ui-react/testUtils';

import { musterApiRef, type JsonSchema, type ToolSummary } from '../../apis';
import { mcpServersRouteRef } from '../../routes';
import { MCPServer } from '../../lib/k8s';
import { McpServersRouter } from '../McpServersRouter';
import { toolCountsLine } from './NewConnectorTestPage';
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
} from '@giantswarm/backstage-plugin-ui-react';

// Each test walks the real multi-step flow with plenty of typing, which gets
// slow when the whole plugin suite runs in parallel (same as BotPrsPage).
jest.setTimeout(30_000);

/** Registered servers of the active installation, per test. */
let mockMcpServers: MCPServer[] = [];

// The muster providers, whose instance the mock below stands for.
jest.mock('../MusterSubPage', () => ({
  MusterSubPage: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['example'],
    isLoadingInstallations: false,
    isSingleInstallation: true,
    installationInfos: [],
    activeInstallation: 'example',
    activeInstallationInfo: {
      name: 'example',
      endpoint: 'https://muster.example.example.com/mcp',
      requiresAuth: true,
    },
    setActiveInstallation: jest.fn(),
    mcpServers: mockMcpServers,
    isLoading: false,
    retry: jest.fn(),
  }),
  useMusterSession: () => ({
    authenticated: true,
    connecting: false,
    connect: jest.fn(),
  }),
}));

jest.mock('../NewMcpServerPage/useTransportDetection', () => ({
  useTransportDetection: () => ({ detected: undefined, probing: false }),
}));

const callTool = jest.fn();
const listServers = jest.fn();
const getAuthStatus = jest.fn();
const filterTools = jest.fn();
// A muster whose core tools take a display name (v5.43.0 and later).
const describeTool = jest.fn(
  (name: string): Promise<{ name: string; inputSchema: JsonSchema }> =>
    Promise.resolve({
      name,
      inputSchema: { properties: { displayName: { type: 'string' } } },
    }),
);

const getServerInfo = jest.fn();
/** The governance mode `core_mcpserver_list` reports beside the servers. */
let reportedGovernance: string | undefined = 'trusted';

const musterApi = {
  callTool,
  listServers,
  getAuthStatus,
  filterTools,
  describeTool,
  getServerInfo,
} as unknown as jest.Mocked<import('../../apis').MusterApi>;

function renderWizard(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, musterApi],
        [externalUrlConsentApiRef, new ExternalUrlConsentManager(jest.fn())],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Routes>
            <Route
              path="/customize/connectors/*"
              element={<McpServersRouter />}
            />
          </Routes>
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/customize/connectors': mcpServersRouteRef },
    },
  );
}

/** Walks the real flow to a registered connector so the Test step has one. */
async function renderTestStep() {
  const result = await renderWizard('/customize/connectors/new');
  await userEvent.type(
    screen.getByLabelText(/^Server address/),
    'https://jira.example.com/mcp',
  );
  await userEvent.type(screen.getByLabelText(/^Name/), 'Jira');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('How do people sign in?');
  await userEvent.click(screen.getByRole('button', { name: 'Add connector' }));
  await screen.findByText('Test the connection');
  return result;
}

function tool(name: string, readOnly: boolean, summary?: string): ToolSummary {
  return {
    name: `x_jira_${name}`,
    summary,
    annotations: readOnly ? { readOnlyHint: true } : {},
  };
}

const TOOLS: ToolSummary[] = [
  tool('search_issues', true, 'Find tickets with a query'),
  tool('get_issue', true),
  tool('list_projects', true),
  tool('add_comment', false, 'Write a comment on a ticket'),
  tool('transition_issue', false),
  tool('create_issue', false),
  tool('get_sprint', true),
  tool('list_boards', true),
];

describe('NewConnectorTestPage', () => {
  beforeEach(() => {
    mockMcpServers = [];
    jest.clearAllMocks();
    callTool.mockResolvedValue({});
    listServers.mockImplementation(() =>
      Promise.resolve({
        mcpServers: [],
        ...(reportedGovernance && { governance: reportedGovernance }),
      }),
    );
    getAuthStatus.mockResolvedValue({ servers: [] });
    filterTools.mockResolvedValue({
      total: 0,
      filtered_count: 0,
      truncated: false,
      tools: [],
    });
    // muster reports its mode on core_mcpserver_list (`/servers`), never on
    // `/server-info`; unknown is tested on its own.
    reportedGovernance = 'trusted';
    getServerInfo.mockResolvedValue({});
  });

  it('reads the settings before offering them', async () => {
    // First of the file's tests to read muster's tools: the wizard's query
    // client is the module's own, so a later test finds them cached.
    withSetApproval();
    connectedWith(approvalTools());
    let answer: () => void = () => {};
    const answered = new Promise<void>(resolve => {
      answer = resolve;
    });
    const plain = describeTool.getMockImplementation()!;
    describeTool.mockImplementation((name: string) =>
      name === 'core_mcpserver_set_approval'
        ? answered.then(() => plain(name))
        : plain(name),
    );

    await renderTestStep();

    expect(
      await screen.findByText('Reading the tool settings…'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    answer();
    expect(await screen.findByText('Everything runs.')).toBeInTheDocument();
  });

  it('sends a deep link with nothing registered back to the Connect step', async () => {
    await renderWizard('/customize/connectors/new/verify');

    expect(await screen.findByText('Connect an app')).toBeInTheDocument();
    expect(screen.queryByText('Test the connection')).not.toBeInTheDocument();
  });

  it('follows the connector while it is still connecting', async () => {
    await renderTestStep();

    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(
      screen.getByText(/This updates automatically once Muster connects it/),
    ).toBeInTheDocument();
  });

  it('reports the connected verdict with the read/change counts and badges', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'jira', state: 'Connected', toolsCount: 8 }],
    });
    filterTools.mockResolvedValue({
      total: 8,
      filtered_count: 8,
      truncated: false,
      tools: TOOLS,
    });

    await renderTestStep();

    expect(
      await screen.findByText(
        /Jira offers 8 tools — 5 that read and 3 that change things\./,
      ),
    ).toBeInTheDocument();
    // Eight is the preview of six plus a remainder too small to hide:
    // every tool shows, prefix-stripped, each with its effect badge.
    expect(await screen.findByText('search_issues')).toBeInTheDocument();
    expect(screen.getByText('Find tickets with a query')).toBeInTheDocument();
    expect(screen.getByText('list_boards')).toBeInTheDocument();
    const list = within(screen.getByRole('list', { name: 'Tool settings' }));
    expect(list.getAllByText('Reads')).toHaveLength(5);
    expect(list.getAllByText('Changes things')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
  });

  it('fits a phone: one line for the steps, long tool names wrap beside their setting', async () => {
    const layout = mockPhoneLayout();
    try {
      listServers.mockResolvedValue({
        mcpServers: [{ name: 'jira', state: 'Connected', toolsCount: 1 }],
      });
      filterTools.mockResolvedValue({
        total: 1,
        filtered_count: 1,
        truncated: false,
        tools: [
          tool('transition_issue_to_the_next_status_in_its_workflow', false),
        ],
      });

      await renderTestStep();

      expect(
        screen.getByText('Step 3 of 3 · Test & Tools'),
      ).toBeInTheDocument();
      const name = await screen.findByText(
        'transition_issue_to_the_next_status_in_its_workflow',
      );
      // The name's column: the name, its badges and its description.
      const column = name.parentElement!.parentElement!;
      expect(getComputedStyle(column).minWidth).toBe('0px');
      expect(getComputedStyle(column).overflowWrap).toBe('anywhere');
      expect(column).toContainElement(screen.getByText('Changes things'));
      // The setting keeps its width; the name gives way.
      const setting = column.nextElementSibling!;
      expect(
        within(setting as HTMLElement).getByText('Allow'),
      ).toBeInTheDocument();
      expect(getComputedStyle(setting).flex).toMatch(/^(none|0 0 auto)$/);
    } finally {
      layout.restore();
    }
  });

  it('lists three tools with the search, no reveal control and no partial-list note', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'jira', state: 'Connected', toolsCount: 3 }],
    });
    filterTools.mockResolvedValue({
      total: 3,
      filtered_count: 3,
      truncated: false,
      tools: TOOLS.slice(0, 3),
    });

    await renderTestStep();

    expect(
      await screen.findByText(
        /Jira offers 3 tools — 3 that read and 0 that change things\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Tool settings' })).getAllByText(
        'Reads',
      ),
    ).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
    // From three tools on, as the connector page's Tools tab does.
    expect(
      screen.getByRole('searchbox', { name: 'Search tools' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/are listed here/)).toBeNull();
  });

  it('pages a 300-tool connector six at a time and says how many there are', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'jira', state: 'Connected', toolsCount: 300 }],
    });
    // muster answers the 200 asked for; its total counts every match.
    const many = Array.from({ length: 200 }, (_, index) =>
      tool(`tool_${index + 1}`, index % 2 === 0),
    );
    filterTools.mockResolvedValue({
      total: 300,
      filtered_count: 200,
      truncated: true,
      tools: many,
    });

    await renderTestStep();

    expect(
      await screen.findByText(/Jira offers 300 tools\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Only the first 200 of 300 tools are listed\./),
    ).toBeInTheDocument();
    const badges = () =>
      within(screen.getByRole('list', { name: 'Tool settings' })).getAllByText(
        /^(Reads|Changes things)$/,
      ).length;
    expect(badges()).toBe(6);
    expect(screen.getByText('tool_6')).toBeInTheDocument();
    expect(screen.queryByText('tool_7')).not.toBeInTheDocument();

    // Staged: the next six, not all 200 at once.
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 6 more tools' }),
    );
    expect(badges()).toBe(12);
    expect(screen.getByText('12 tools shown, 188 more')).toBeInTheDocument();
  });

  it('offers the one-time sign-in when the connector reports Auth Required', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'jira', state: 'Auth Required' }],
    });

    await renderTestStep();

    expect(
      await screen.findByText(
        "This connector needs your sign-in — that's normal",
      ),
    ).toBeInTheDocument();
  });

  it('says what failed when the connector does not connect', async () => {
    listServers.mockResolvedValue({
      mcpServers: [
        {
          name: 'jira',
          state: 'Failed',
          statusMessage: 'connection refused',
        },
      ],
    });

    await renderTestStep();

    expect(
      await screen.findByText('The connector is not connecting'),
    ).toBeInTheDocument();
    // In the status line and the failure explanation.
    expect(screen.getAllByText('connection refused').length).toBeGreaterThan(0);
  });
});

/** A muster that saves tool settings (`core_mcpserver_set_approval`). */
function withSetApproval(rules = ['Allow', 'Ask', 'Block']) {
  describeTool.mockImplementation((name: string) => {
    const properties: Record<string, JsonSchema> =
      name === 'core_mcpserver_set_approval'
        ? {
            name: { type: 'string' },
            approval: {
              type: 'object',
              properties: { rule: { type: 'string', enum: rules } },
            },
            preset: { type: 'string' },
            expectedGeneration: { type: 'integer' },
          }
        : { displayName: { type: 'string' } };
    return Promise.resolve({ name, inputSchema: { properties } });
  });
}

/** Jira's tools as muster reports them with approval, for a connector admin. */
function approvalTools(
  overrides: Partial<ToolSummary> = {},
  source: 'unreviewed' | 'tool' | 'connector' | 'unavailable' = 'unreviewed',
): ToolSummary[] {
  return [
    tool('search_issues', true, 'Find tickets with a query'),
    tool('get_issue', true),
    tool('add_comment', false, 'Write a comment on a ticket'),
    tool('create_issue', false),
  ].map(t => ({
    ...t,
    approval: { setting: source === 'unavailable' ? 'ask' : 'allow', source },
    connectorAdmin: true,
    ...overrides,
  }));
}

function connectedWith(
  tools: ToolSummary[],
  approval?: unknown,
  generation?: number,
) {
  listServers.mockResolvedValue({
    mcpServers: [
      {
        name: 'jira',
        state: 'Connected',
        toolsCount: tools.length,
        ...(approval ? { approval } : {}),
        ...(generation !== undefined && { generation }),
      },
    ],
    ...(reportedGovernance && { governance: reportedGovernance }),
  });
  filterTools.mockResolvedValue({
    total: tools.length,
    filtered_count: tools.length,
    truncated: false,
    tools,
  });
}

const pills = (name: string) =>
  screen.getByRole('radiogroup', { name: `Approval for ${name}` });

/** The pill chosen in a group: bui's toggle buttons say it with aria-checked or aria-pressed. */
function chosen(group: HTMLElement): string | undefined {
  return (
    within(group)
      .queryAllByRole('radio')
      .concat(within(group).queryAllByRole('button'))
      .find(
        button =>
          button.getAttribute('aria-checked') === 'true' ||
          button.getAttribute('aria-pressed') === 'true',
      )?.textContent ?? undefined
  );
}

function setApprovalCalls() {
  return callTool.mock.calls.filter(
    ([name]) => name === 'core_mcpserver_set_approval',
  );
}

describe('NewConnectorTestPage: Test & Tools', () => {
  beforeEach(() => {
    mockMcpServers = [];
    jest.clearAllMocks();
    callTool.mockResolvedValue({});
    getAuthStatus.mockResolvedValue({ servers: [] });
    // muster reports its mode on core_mcpserver_list (`/servers`), never on
    // `/server-info`; unknown is tested on its own.
    reportedGovernance = 'trusted';
    getServerInfo.mockResolvedValue({});
    withSetApproval();
  });

  it('pre-selects Allow all on a trusted platform and saves every tool explicitly', async () => {
    connectedWith(approvalTools());

    await renderTestStep();

    expect(await screen.findByText('Everything runs.')).toBeInTheDocument();
    expect(chosen(pills('add_comment'))).toBe('Allow');
    expect(chosen(pills('search_issues'))).toBe('Allow');
    expect(screen.getByText('New tools follow this rule.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
    expect(setApprovalCalls()[0]).toEqual([
      'core_mcpserver_set_approval',
      {
        name: 'jira',
        approval: {
          rule: 'Allow',
          tools: {
            search_issues: 'Allow',
            get_issue: 'Allow',
            add_comment: 'Allow',
            create_issue: 'Allow',
          },
        },
      },
      'example',
    ]);
  });

  it('pre-selects Recommended on a governed platform: reads run, the rest ask', async () => {
    reportedGovernance = 'governed';
    connectedWith(approvalTools());

    await renderTestStep();

    expect(
      await screen.findByText('Read-only tools run. The rest ask.'),
    ).toBeInTheDocument();
    expect(chosen(pills('search_issues'))).toBe('Allow');
    expect(chosen(pills('add_comment'))).toBe('Ask');
    expect(chosen(pills('create_issue'))).toBe('Ask');
    expect(
      chosen(screen.getByRole('radiogroup', { name: 'Rule for new tools' })),
    ).toBe('Ask');
  });

  it.each([
    [
      'reports no mode (an older muster)',
      () => {
        reportedGovernance = undefined;
      },
    ],
    [
      'reports another value and /server-info cannot be asked',
      () => {
        reportedGovernance = 'open';
        getServerInfo.mockRejectedValue(new Error('upstream 502'));
      },
    ],
  ])(
    'pre-selects Recommended and says so when muster %s, never Allow all',
    async (_, serve) => {
      serve();
      connectedWith(approvalTools());

      await renderTestStep();

      expect(
        await screen.findByText('Read-only tools run. The rest ask.'),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(/governance mode could not be read/),
      ).toBeInTheDocument();
      expect(chosen(pills('add_comment'))).toBe('Ask');
      expect(chosen(pills('search_issues'))).toBe('Allow');

      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
      expect(
        (setApprovalCalls()[0][1] as { approval: { rule: string } }).approval
          .rule,
      ).toBe('Ask');
    },
  );

  it('fills every pill from a preset, marks a changed row and resets it', async () => {
    connectedWith(approvalTools());

    await renderTestStep();
    await screen.findByText('Everything runs.');

    await userEvent.click(screen.getByRole('radio', { name: 'Ask all' }));
    expect(screen.getByText('Everything asks.')).toBeInTheDocument();
    for (const name of ['search_issues', 'get_issue', 'add_comment']) {
      expect(chosen(pills(name))).toBe('Ask');
    }

    // A tool set apart from the preset: no preset is chosen any more, and
    // the row says so and can go back.
    await userEvent.click(
      within(pills('create_issue')).getByRole('radio', { name: 'Block' }),
    );
    expect(chosen(pills('create_issue'))).toBe('Block');
    expect(screen.getByText('Edited, was Ask')).toBeInTheDocument();
    expect(
      screen.getByText('Your own settings. A preset fills every tool again.'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Reset create_issue to Ask' }),
    );
    expect(chosen(pills('create_issue'))).toBe('Ask');
    expect(screen.queryByText(/^Edited, was/)).not.toBeInTheDocument();

    await userEvent.click(
      within(pills('create_issue')).getByRole('radio', { name: 'Block' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
    expect(setApprovalCalls()[0][1]).toEqual({
      name: 'jira',
      approval: {
        rule: 'Ask',
        tools: {
          search_issues: 'Ask',
          get_issue: 'Ask',
          add_comment: 'Ask',
          create_issue: 'Block',
        },
      },
    });
  });

  it('opens a reviewed connector on its saved settings, with New tools and hidden blocked ones', async () => {
    connectedWith(
      approvalTools({ connectorAdmin: true }, 'tool').map(t =>
        t.name === 'x_jira_create_issue'
          ? {
              ...t,
              approval: { setting: 'ask', source: 'connector', new: true },
            }
          : t,
      ),
      {
        rule: 'Ask',
        tools: {
          search_issues: 'Allow',
          get_issue: 'Allow',
          add_comment: 'Ask',
          delete_project: 'Block',
        },
      },
    );

    await renderTestStep();

    // No preset fits the saved settings; the rule and the rows show them.
    expect(
      await screen.findByText(
        'Your own settings. A preset fills every tool again.',
      ),
    ).toBeInTheDocument();
    expect(chosen(pills('add_comment'))).toBe('Ask');
    expect(chosen(pills('create_issue'))).toBe('Ask');
    expect(screen.getByText('New')).toBeInTheDocument();
    // muster lists no blocked tool; its entry still has a row.
    expect(chosen(pills('delete_project'))).toBe('Block');
    expect(
      screen.getByText(/Not listed by the connector right now/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Edited, was/)).not.toBeInTheDocument();

    await userEvent.click(
      within(pills('add_comment')).getByRole('radio', { name: 'Allow' }),
    );
    expect(screen.getByText('Edited, was Ask')).toBeInTheDocument();
    // Edit state is plain text beside the setting with its own explanation,
    // not a badge, and no tool effect reads "Changed".
    expect(
      screen.getByText(/Unsaved change: this tool was Ask/),
    ).toBeInTheDocument();
    expect(screen.getByTitle(/Unsaved change: this tool was Ask/)).toBeTruthy();
    expect(screen.queryByText('Changed')).not.toBeInTheDocument();
    expect(
      screen.getByText('Edited, was Ask').closest('.bui-Badge'),
    ).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
    expect(setApprovalCalls()[0][1]).toEqual({
      name: 'jira',
      approval: {
        rule: 'Ask',
        tools: {
          search_issues: 'Allow',
          get_issue: 'Allow',
          add_comment: 'Allow',
          create_issue: 'Ask',
          delete_project: 'Block',
        },
      },
    });
  });

  it.each([
    ['Ask', 'recommended', 'Read-only tools run. The rest ask.', 'Allow'],
    ['Allow', 'allow-all', 'Everything runs.', 'Allow'],
  ])(
    'opens a just-created connector (rule %s stored, no tools) on its preset expanded, not reviewed, and Done writes every tool',
    async (rule, _preset, hint, readOnly) => {
      // As muster reports a create's preset: the rule alone, every tool
      // following it as New.
      connectedWith(
        approvalTools().map(t => ({
          ...t,
          approval: {
            setting: rule === 'Ask' ? ('ask' as const) : ('allow' as const),
            source: 'connector' as const,
            new: true,
          },
        })),
        { rule },
      );

      await renderTestStep();

      expect(await screen.findByText(hint)).toBeInTheDocument();
      expect(chosen(pills('search_issues'))).toBe(readOnly);
      expect(screen.queryByText('New')).not.toBeInTheDocument();
      expect(screen.queryByText(/^Edited, was/)).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
      const { approval } = setApprovalCalls()[0][1] as {
        approval: { rule: string; tools: Record<string, string> };
      };
      expect(approval.rule).toBe(rule);
      expect(Object.keys(approval.tools).sort()).toEqual([
        'add_comment',
        'create_issue',
        'get_issue',
        'search_issues',
      ]);
      expect(approval.tools.add_comment).toBe(rule);
      expect(approval.tools.search_issues).toBe('Allow');
    },
  );

  it('writes nothing over settings another admin changed since the step read them, and shows theirs', async () => {
    const saved = {
      rule: 'Ask',
      tools: {
        search_issues: 'Allow',
        get_issue: 'Allow',
        add_comment: 'Ask',
        create_issue: 'Ask',
      },
    };
    connectedWith(approvalTools({}, 'tool'), saved);

    await renderTestStep();
    await screen.findByRole('radiogroup', {
      name: 'Approval for create_issue',
    });
    expect(chosen(pills('create_issue'))).toBe('Ask');

    // Meanwhile another admin blocks create_issue.
    const theirs = {
      ...saved,
      tools: { ...saved.tools, create_issue: 'Block' },
    };
    connectedWith(approvalTools({}, 'tool'), theirs);
    await userEvent.click(
      within(pills('get_issue')).getByRole('radio', { name: 'Ask' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(
      await screen.findByText('The tool settings changed meanwhile'),
    ).toBeInTheDocument();
    expect(setApprovalCalls()).toHaveLength(0);
    // Their Block shows; the person's own change stays on top.
    await waitFor(() => expect(chosen(pills('create_issue'))).toBe('Block'));
    expect(chosen(pills('get_issue'))).toBe('Ask');

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
    expect(setApprovalCalls()[0][1]).toEqual({
      name: 'jira',
      approval: {
        rule: 'Ask',
        tools: {
          search_issues: 'Allow',
          get_issue: 'Ask',
          add_comment: 'Ask',
          create_issue: 'Block',
        },
      },
    });
  });

  it('blocks new tools when the rule is set to Block, and says what that does', async () => {
    connectedWith(approvalTools());

    await renderTestStep();
    await screen.findByText('Everything runs.');
    const rule = screen.getByRole('radiogroup', { name: 'Rule for new tools' });
    await userEvent.click(within(rule).getByRole('radio', { name: 'Block' }));

    expect(chosen(rule)).toBe('Block');
    expect(
      screen.getByText(
        /they are hidden and can't be used until someone sets them/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
    expect(
      (setApprovalCalls()[0][1] as { approval: { rule: string } }).approval
        .rule,
    ).toBe('Block');
  });

  it('keeps Ask pre-selected for new tools on a governed platform, Block selectable', async () => {
    reportedGovernance = 'governed';
    connectedWith(approvalTools());

    await renderTestStep();
    await screen.findByText('Read-only tools run. The rest ask.');
    const rule = screen.getByRole('radiogroup', { name: 'Rule for new tools' });

    expect(chosen(rule)).toBe('Ask');
    expect(within(rule).getByRole('radio', { name: 'Block' })).toBeEnabled();
  });

  it('offers no Block rule where muster takes only Allow and Ask', async () => {
    withSetApproval(['Allow', 'Ask']);
    connectedWith(approvalTools());

    await renderTestStep();
    await screen.findByText('Everything runs.');
    const rule = screen.getByRole('radiogroup', { name: 'Rule for new tools' });

    expect(
      within(rule)
        .getAllByRole('radio')
        .map(r => r.textContent),
    ).toEqual(['Allow', 'Ask']);
  });

  it('sends the generation it read as expectedGeneration, and shows muster refusing a stale one as a conflict', async () => {
    connectedWith(approvalTools(), undefined, 7);
    callTool.mockImplementation((name: string) =>
      name === 'core_mcpserver_set_approval'
        ? Promise.reject(
            new Error(
              "conflict: MCP server 'jira' changed since it was read (generation 8 now, expectedGeneration 7): read it again with core_mcpserver_get and apply the change to what it holds now",
            ),
          )
        : Promise.resolve({}),
    );

    await renderTestStep();
    await screen.findByText('Everything runs.');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
    expect(setApprovalCalls()[0][1]).toMatchObject({
      name: 'jira',
      expectedGeneration: 7,
    });
    expect(
      await screen.findByText('The tool settings changed meanwhile'),
    ).toBeInTheDocument();
    expect(screen.getByText('Test the connection')).toBeInTheDocument();
  });

  it('sends no expectedGeneration to a muster whose set_approval does not take it', async () => {
    describeTool.mockImplementation((name: string) =>
      Promise.resolve({
        name,
        inputSchema: {
          properties: (name === 'core_mcpserver_set_approval'
            ? { name: {}, approval: {} }
            : { displayName: { type: 'string' } }) as Record<
            string,
            JsonSchema
          >,
        },
      }),
    );
    connectedWith(approvalTools(), undefined, 7);

    await renderTestStep();
    await screen.findByText('Everything runs.');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
    expect(setApprovalCalls()[0][1]).not.toHaveProperty('expectedGeneration');
  });

  it('keeps a stored Block rule without tool entries, and Done does not loosen it', async () => {
    connectedWith(
      approvalTools().map(t => ({
        ...t,
        approval: { setting: 'ask' as const, source: 'connector' as const },
      })),
      { rule: 'Block' },
    );

    await renderTestStep();
    const rule = await screen.findByRole('radiogroup', {
      name: 'Rule for new tools',
    });
    expect(chosen(rule)).toBe('Block');

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
    const { approval } = setApprovalCalls()[0][1] as {
      approval: { rule: string; tools: Record<string, string> };
    };
    expect(approval.rule).toBe('Block');
    // Each listed tool stays as the rule leaves it now: Block, not Ask.
    expect(new Set(Object.values(approval.tools))).toEqual(new Set(['Block']));
  });

  it('saves nothing when a reviewed connector is left unchanged', async () => {
    connectedWith(approvalTools({}, 'tool'), {
      rule: 'Allow',
      tools: {
        search_issues: 'Allow',
        get_issue: 'Allow',
        add_comment: 'Allow',
        create_issue: 'Allow',
      },
    });

    await renderTestStep();
    await screen.findByText('Everything runs.');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() =>
      expect(screen.queryByText('Test the connection')).not.toBeInTheDocument(),
    );
    expect(setApprovalCalls()).toHaveLength(0);
  });

  describe('searching and filtering the tool settings', () => {
    const rows = () =>
      within(
        screen.getByRole('list', { name: 'Tool settings' }),
      ).queryAllByRole('listitem');

    async function openStep() {
      connectedWith(approvalTools());
      await renderTestStep();
      await screen.findByText('Everything runs.');
    }

    it('narrows the list by search and by what a tool does, and says what is hidden', async () => {
      await openStep();
      expect(rows()).toHaveLength(4);

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search tools' }),
        'comment',
      );
      expect(rows()).toHaveLength(1);
      expect(screen.getByText('add_comment')).toBeInTheDocument();
      expect(
        screen.getByText(/3 of 4 tools are hidden by the search or filter/),
      ).toBeInTheDocument();

      await userEvent.clear(
        screen.getByRole('searchbox', { name: 'Search tools' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: /Filter by what it does/ }),
      );
      await userEvent.click(
        await screen.findByRole('option', { name: /Changes things/ }),
      );
      await userEvent.keyboard('{Escape}');
      expect(rows()).toHaveLength(2);
      expect(screen.getByText('create_issue')).toBeInTheDocument();
      expect(screen.queryByText('get_issue')).not.toBeInTheDocument();
    });

    it('never changes the settings of hidden tools: only the change made is saved over the rest', async () => {
      await openStep();
      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search tools' }),
        'comment',
      );
      await userEvent.click(
        within(pills('add_comment')).getByRole('radio', { name: 'Ask' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));

      await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
      expect(setApprovalCalls()[0][1].approval).toEqual({
        rule: 'Allow',
        tools: {
          search_issues: 'Allow',
          get_issue: 'Allow',
          add_comment: 'Ask',
          create_issue: 'Allow',
        },
      });
    });

    it('applies a preset to all tools unfiltered, and to the shown ones only, with their count, when narrowed', async () => {
      await openStep();
      expect(screen.getByText('Start from')).toBeInTheDocument();

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search tools' }),
        'issue',
      );
      // search_issues, get_issue, create_issue.
      expect(screen.getByText('Set the 3 shown tools to')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Applies to the 3 shown only: the other 1 and the rule/,
        ),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Ask all' }));
      expect(chosen(pills('get_issue'))).toBe('Ask');

      await userEvent.clear(
        screen.getByRole('searchbox', { name: 'Search tools' }),
      );
      expect(screen.getByText('Start from')).toBeInTheDocument();
      expect(chosen(pills('add_comment'))).toBe('Allow');
      expect(chosen(pills('create_issue'))).toBe('Ask');

      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
      expect(setApprovalCalls()[0][1].approval).toEqual({
        rule: 'Allow',
        tools: {
          search_issues: 'Ask',
          get_issue: 'Ask',
          add_comment: 'Allow',
          create_issue: 'Ask',
        },
      });
    });

    describe('by approval setting', () => {
      async function openReviewed() {
        connectedWith(approvalTools({}, 'tool'), {
          rule: 'Ask',
          tools: {
            search_issues: 'Allow',
            get_issue: 'Allow',
            add_comment: 'Ask',
            create_issue: 'Ask',
            delete_project: 'Block',
          },
        });
        await renderTestStep();
        await screen.findByText(
          'Your own settings. A preset fills every tool again.',
        );
      }

      async function pickApproval(option: RegExp) {
        await userEvent.click(
          screen.getByRole('button', { name: /Filter by approval/ }),
        );
        await userEvent.click(
          await screen.findByRole('option', { name: option }),
        );
        await userEvent.keyboard('{Escape}');
      }

      it('lists only the blocked tools when Block is picked, and offers the setting counts', async () => {
        await openReviewed();
        await userEvent.click(
          screen.getByRole('button', { name: /Filter by approval/ }),
        );
        expect(
          within(await screen.findByRole('listbox'))
            .getAllByRole('option')
            .map(option => option.textContent),
        ).toEqual(['Allow 2', 'Ask 2', 'Block 1']);
        await userEvent.click(screen.getByRole('option', { name: /Block/ }));
        await userEvent.keyboard('{Escape}');

        expect(rows()).toHaveLength(1);
        expect(screen.getByText('delete_project')).toBeInTheDocument();
        expect(
          screen.getByText(/4 of 5 tools are hidden by the search or filter/),
        ).toBeInTheDocument();
      });

      it('keeps a row listed, marked, when its setting is changed under a filter, until the filter changes', async () => {
        await openReviewed();
        await pickApproval(/Ask/);
        expect(rows()).toHaveLength(2);

        await userEvent.click(
          within(pills('add_comment')).getByRole('radio', { name: 'Allow' }),
        );
        expect(rows()).toHaveLength(2);
        expect(
          screen.getAllByText("Doesn't match the filter now"),
        ).toHaveLength(1);
        // The counts follow the pills.
        await userEvent.click(
          screen.getByRole('button', { name: /Filter by approval/ }),
        );
        expect(
          within(await screen.findByRole('listbox'))
            .getAllByRole('option')
            .map(option => option.textContent),
        ).toEqual(['Allow 3', 'Ask 1', 'Block 1']);

        // Changing the filter lets the row go.
        await userEvent.click(screen.getByRole('option', { name: /Block/ }));
        await userEvent.keyboard('{Escape}');
        expect(
          screen.queryByText("Doesn't match the filter now"),
        ).not.toBeInTheDocument();
        // Ask and Block now: create_issue and delete_project.
        expect(rows()).toHaveLength(2);
        expect(screen.queryByText('add_comment')).not.toBeInTheDocument();
      });

      it('applies a preset to the shown tools only, and saves the hidden ones as they were', async () => {
        await openReviewed();
        await pickApproval(/Ask/);
        expect(
          screen.getByText('Set the 2 shown tools to'),
        ).toBeInTheDocument();
        await userEvent.click(
          screen.getByRole('button', { name: 'Allow all' }),
        );
        // Both rows no longer match but stay, marked.
        expect(rows()).toHaveLength(2);
        expect(
          screen.getAllByText("Doesn't match the filter now"),
        ).toHaveLength(2);

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        await waitFor(() => expect(setApprovalCalls()).toHaveLength(1));
        expect(setApprovalCalls()[0][1].approval.tools).toEqual({
          search_issues: 'Allow',
          get_issue: 'Allow',
          add_comment: 'Allow',
          create_issue: 'Allow',
          delete_project: 'Block',
        });
      });
    });

    it('offers the same search to a person who cannot change the settings', async () => {
      connectedWith(approvalTools({ connectorAdmin: false }, 'tool'), {
        tools: {
          search_issues: 'Allow',
          get_issue: 'Allow',
          add_comment: 'Allow',
          create_issue: 'Allow',
        },
      });
      await renderTestStep();
      await screen.findByText(
        /Only a connector admin can change these settings/,
      );

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search tools' }),
        'comment',
      );
      expect(rows()).toHaveLength(1);
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });
  });

  it('shows the settings read-only, with no controls, to a person who is not a connector admin', async () => {
    connectedWith(
      approvalTools({ connectorAdmin: false }, 'tool').map(t =>
        t.name === 'x_jira_create_issue'
          ? { ...t, approval: { setting: 'ask', source: 'tool' } }
          : t,
      ),
      {
        tools: {
          search_issues: 'Allow',
          get_issue: 'Allow',
          add_comment: 'Allow',
          create_issue: 'Ask',
        },
      },
    );

    await renderTestStep();

    expect(
      await screen.findByText(
        /Only a connector admin can change these settings/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('radiogroup')).toHaveLength(0);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    const createRow = screen
      .getByText('create_issue')
      .closest('[role="listitem"]') as HTMLElement;
    expect(within(createRow).getByText('Ask')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByText('Test the connection')).not.toBeInTheDocument(),
    );
    expect(setApprovalCalls()).toHaveLength(0);
  });

  it('says so when muster cannot read the settings, and offers nothing to change', async () => {
    connectedWith(approvalTools({}, 'unavailable'));

    await renderTestStep();

    expect(
      await screen.findByText("The tool settings can't be read"),
    ).toBeInTheDocument();
    // In muster's terms: the tools report Ask, and calls do not run.
    expect(
      screen.getByText(/reports every tool as Ask and does not run them/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Done saves nothing here/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it("describes each pill by its setting's line in the legend", async () => {
    connectedWith(approvalTools());

    await renderTestStep();
    await screen.findByText('Everything runs.');

    expect(
      within(pills('add_comment')).getByRole('radio', { name: 'Allow' }),
    ).toHaveAccessibleDescription('Runs without asking.');
    expect(
      within(pills('add_comment')).getByRole('radio', { name: 'Block' }),
    ).toHaveAccessibleDescription("Hidden. Can't be used.");
  });

  it('warns with the reason where approvals cannot be answered, and keeps the settings', async () => {
    connectedWith(
      approvalTools({
        approval: {
          setting: 'ask',
          source: 'connector',
          unavailable: "muster's shared store is not on Valkey",
        },
      }),
    );

    await renderTestStep();

    expect(
      await screen.findByText("Approvals can't be answered right now"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/shared store is not on Valkey/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The tool settings can't be read"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
  });

  it('keeps the person on the step with the reason when the save fails, and saves on the next Done', async () => {
    connectedWith(approvalTools());
    callTool.mockImplementation((name: string) =>
      name === 'core_mcpserver_set_approval'
        ? Promise.reject(
            new Error(
              'mcpservers.muster.giantswarm.io "jira" is forbidden: User "dev@lab.local" cannot update resource "mcpservers" in API group "muster.giantswarm.io" in the namespace "muster"',
            ),
          )
        : Promise.resolve({}),
    );

    await renderTestStep();
    await screen.findByText('Everything runs.');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(
      await screen.findByText('The tool settings were not saved'),
    ).toBeInTheDocument();
    // Said plainly, not as the apiserver's words.
    expect(screen.getByText(/don't have rights to edit/)).toBeInTheDocument();
    expect(screen.getByText('Test the connection')).toBeInTheDocument();

    callTool.mockResolvedValue({});
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByText('Test the connection')).not.toBeInTheDocument(),
    );
    expect(setApprovalCalls()).toHaveLength(2);
  });

  it('keeps the reason of a save refused for another cause, forbidden or not, as muster gave it', async () => {
    connectedWith(approvalTools());
    callTool.mockImplementation((name: string) =>
      name === 'core_mcpserver_set_approval'
        ? Promise.reject(
            new Error(
              'spec.approval is forbidden: approval settings need muster 5.66 or later',
            ),
          )
        : Promise.resolve({}),
    );

    await renderTestStep();
    await screen.findByText('Everything runs.');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(
      await screen.findByText(/approval settings need muster 5\.66 or later/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/don't have rights to edit/)).toBeNull();
    expect(
      screen.getByText(/Nothing changed; press Done to try again/),
    ).toBeInTheDocument();
  });

  it('shows the settings as they are where muster cannot save them yet', async () => {
    connectedWith(approvalTools());
    describeTool.mockImplementation((name: string) =>
      name === 'core_mcpserver_set_approval'
        ? Promise.reject(new Error('tool not found'))
        : Promise.resolve({
            name,
            inputSchema: { properties: { displayName: { type: 'string' } } },
          }),
    );

    await renderTestStep();

    expect(
      await screen.findByText(/can't save tool settings from the portal yet/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('offers no settings while the connector lists no tools, and Done saves nothing', async () => {
    connectedWith([]);

    await renderTestStep();

    expect(
      await screen.findByText(/No tools reported yet/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Tool settings' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByText('Test the connection')).not.toBeInTheDocument(),
    );
    expect(setApprovalCalls()).toHaveLength(0);
  });
});

describe('toolCountsLine', () => {
  it('counts reads and changes, defaulting unannotated tools to "changes"', () => {
    expect(toolCountsLine(TOOLS)).toBe(
      '8 tools — 5 that read and 3 that change things',
    );
    expect(toolCountsLine([tool('get_issue', true)])).toBe(
      '1 tool — 1 that read and 0 that change things',
    );
  });
});
