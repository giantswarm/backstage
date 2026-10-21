import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import type { Workspace } from '../../lib/workspaceManager';
import { workspacesRouteRef } from '../../routes';
import { WorkspaceEditorPage } from './WorkspaceEditorPage';
import {
  createWorkspaceManagerFake,
  manyRepositories,
  type FakeRepository,
  type WorkspaceManagerFake,
} from './workspaceManagerFake';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const GITHUB = {
  name: 'github',
  kind: 'github',
  connected: true,
};
const GITLAB = {
  name: 'gitlab-lab',
  kind: 'gitlab',
  connected: true,
};

/** The muster server whose sign-in grants gitlab-lab's App. */
const GITLAB_GRANT_SERVER = 'gitlab-lab-app';
const UNGRANTED_GITLAB = {
  ...GITLAB,
  connected: false,
  signIn: `grant the App of provider gitlab-lab once in muster: core_auth_login server=${GITLAB_GRANT_SERVER}`,
};

function repo(
  provider: string,
  owner: string,
  name: string,
  language: string,
  topics: string[] = [],
): FakeRepository {
  return {
    provider,
    owner,
    name,
    language,
    topics,
    lastPush: '2026-10-01T00:00:00Z',
    sizeKiB: 2048,
  };
}

const ACME = [
  repo('github', 'acme', 'mcp-kubernetes', 'Go', ['mcp']),
  repo('github', 'acme', 'mcp-prometheus', 'Go', ['mcp']),
  repo('github', 'acme', 'portal', 'TypeScript', ['mcp']),
  repo('github', 'acme', 'operator', 'Go', []),
];
const LAB = [repo('gitlab-lab', 'platform', 'charts', 'Go', ['helm'])];

async function render(
  fake: WorkspaceManagerFake,
  props: { name?: string } = {},
) {
  const musterApi = {
    callTool: fake.callTool,
    listServers: fake.listServers,
    listInstallations: fake.listInstallations,
    getAuthStatus: fake.getAuthStatus,
    signInServer: fake.signInServer,
  } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <WorkspaceEditorPage
            installation="lab"
            organization="acme"
            {...props}
          />
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/customize/workspaces': workspacesRouteRef } },
  );
}

async function source0Owner() {
  return within(await screen.findByTestId('workspace-source-0')).findByRole(
    'textbox',
    { name: /^Owner/ },
  );
}

function source(index: number) {
  return within(screen.getByTestId(`workspace-source-${index}`));
}

/**
 * Ticks an option in one of a source's filter dropdowns (Language, Topics,
 * Including), then closes it.
 */
async function pickFilter(index: number, dropdown: string, option: string) {
  fireEvent.click(
    await source(index).findByRole('button', {
      name: new RegExp(`^${dropdown}:`),
    }),
  );
  fireEvent.click(await screen.findByRole('checkbox', { name: option }));
  await closePopover();
}

/** Closes the open filter dropdown, which hides the page from queries. */
async function closePopover() {
  fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}

/** Lets the preview's debounce run out. */
async function settlePreview() {
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
}

beforeEach(() => {
  mockNavigate.mockReset();
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('WorkspaceEditorPage', () => {
  it('previews a language and topic filter, excludes one, and creates the workspace', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);

    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'platform-mcp' },
    });
    fireEvent.change(source(0).getByRole('textbox', { name: /^Owner/ }), {
      target: { value: 'acme' },
    });
    await pickFilter(0, 'Language', 'Go');
    await pickFilter(0, 'Topics', 'mcp');
    await settlePreview();

    expect(
      await source(0).findByTestId('filter-match-total'),
    ).toHaveTextContent('2 repositories match');
    const preview = within(screen.getByTestId('workspace-preview'));
    expect(await preview.findByText('acme/mcp-kubernetes')).toBeInTheDocument();
    expect(preview.getByText('acme/mcp-prometheus')).toBeInTheDocument();
    expect(preview.queryByText('acme/portal')).not.toBeInTheDocument();
    expect(preview.getByTestId('preview-total')).toHaveTextContent(
      '2 repositories',
    );

    // Unticking a filter match excludes it.
    fireEvent.click(
      await source(0).findByRole('checkbox', { name: 'mcp-prometheus' }),
    );
    expect(source(0).getByTestId('repository-summary')).toHaveTextContent(
      '2 by filter · 0 by name · 1 excluded = 1 repository',
    );
    await settlePreview();
    await waitFor(() =>
      expect(
        preview.queryByText('acme/mcp-prometheus'),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() =>
      expect(fake.callsOf('create_workspace')).toHaveLength(1),
    );
    expect(fake.callsOf('create_workspace')[0]).toEqual({
      name: 'platform-mcp',
      organization: 'acme',
      sources: [
        {
          provider: 'github',
          owner: 'acme',
          filters: {
            languages: ['Go'],
            topics: { match: 'any', names: ['mcp'] },
          },
          exclude: ['mcp-prometheus'],
        },
      ],
    });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/customize/workspaces?organization=acme',
      ),
    );
  });

  it("shows the manager's validation message on its field and writes nothing else", async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    fake.onWrite('create_workspace', () => {
      throw new Error(
        'create_workspace: invalid workspace: Workspace.workspace-manager.giantswarm.io "platform-mcp" is invalid: spec.sources[0].owner: Invalid value: "acme!": owner must be a provider account name',
      );
    });
    await render(fake);

    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'platform-mcp' },
    });
    fireEvent.change(source(0).getByRole('textbox', { name: /^Owner/ }), {
      target: { value: 'acme!' },
    });
    // A pick by name, so the source has a selector without the owner's listing.
    fake.onWrite('update_workspace', () => {
      throw new Error('update must not be called');
    });
    const ownerField = source(0).getByRole('textbox', { name: /^Owner/ });
    // No selector yet: the form's own check holds the save back first.
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(
      await screen.findByText(
        'Pick repositories by name, or filter by language or topic',
      ),
    ).toBeInTheDocument();
    expect(fake.callsOf('create_workspace')).toHaveLength(0);

    // Give it a topic the fake's owner listing would not offer for `acme!`:
    // through the selected-only view's absence, set it by editing the draft
    // as a person would — picking a repository by name in the picker.
    fireEvent.change(ownerField, { target: { value: 'acme' } });
    fireEvent.click(await source(0).findByRole('checkbox', { name: 'portal' }));
    fireEvent.change(ownerField, { target: { value: 'acme!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() =>
      expect(fake.callsOf('create_workspace')).toHaveLength(1),
    );
    const owner = source(0).getByRole('textbox', { name: /^Owner/ });
    await waitFor(() =>
      expect(owner).toHaveAccessibleDescription(
        expect.stringContaining('owner must be a provider account name'),
      ),
    );
    expect(fake.callsOf('update_workspace')).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('edits and previews two sources on different provider instances', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB, GITLAB],
      repositories: [...ACME, ...LAB],
    });
    await render(fake);

    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'mixed' },
    });
    // Source 1: github / acme, Go repositories.
    fireEvent.click(source(0).getByRole('button', { name: /Provider/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'GitHub' }));
    fireEvent.change(source(0).getByRole('textbox', { name: /^Owner/ }), {
      target: { value: 'acme' },
    });
    await pickFilter(0, 'Language', 'Go');

    // Source 2: gitlab-lab / platform, one repository by name.
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    fireEvent.click(source(1).getByRole('button', { name: /Provider/ }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'gitlab-lab (GitLab)' }),
    );
    fireEvent.change(source(1).getByRole('textbox', { name: /^Owner/ }), {
      target: { value: 'platform' },
    });
    fireEvent.click(await source(1).findByRole('checkbox', { name: 'charts' }));
    await settlePreview();

    const preview = within(screen.getByTestId('workspace-preview'));
    expect(await preview.findByText('platform/charts')).toBeInTheDocument();
    expect(preview.getByText('acme/mcp-kubernetes')).toBeInTheDocument();
    expect(preview.getByTestId('preview-total')).toHaveTextContent(
      '4 repositories',
    );
    const last = fake.callsOf('preview_workspace').at(-1)!;
    expect(last.sources).toEqual([
      { provider: 'github', owner: 'acme', filters: { languages: ['Go'] } },
      { provider: 'gitlab-lab', owner: 'platform', repositories: ['charts'] },
    ]);
  });

  it("shows a field's problem once the person leaves it, before any save", async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);

    const name = await screen.findByRole('textbox', { name: /^Name/ });
    fireEvent.change(name, { target: { value: 'Platform MCP' } });
    expect(
      screen.queryByText(/Use lowercase letters, digits and dashes only/),
    ).not.toBeInTheDocument();
    fireEvent.blur(name);
    expect(
      await screen.findByText(/Use lowercase letters, digits and dashes only/),
    ).toBeInTheDocument();
    // A field not yet left stays quiet.
    expect(screen.queryByText('Owner is required')).not.toBeInTheDocument();
  });

  it('names no provider when there is only one to choose', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);

    const owner = await source0Owner();
    expect(owner).toHaveAccessibleDescription(
      /The GitHub organization, group or user/,
    );
    expect(screen.queryByText(/^Provider/)).not.toBeInTheDocument();
  });

  it('has no schedule field', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);

    await screen.findByRole('textbox', { name: /^Name/ });
    expect(
      screen.queryByText(/nightly|weekly|weekday/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /hour/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/There is no schedule/)).not.toBeInTheDocument();
  });

  it('shows no source until the provider instances are read', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB, GITLAB],
      repositories: ACME,
    });
    const answer = fake.callTool.getMockImplementation()!;
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    fake.callTool.mockImplementation(async (name: string, args) => {
      if (name.endsWith('list_providers')) {
        await held;
      }
      return answer(name, args);
    });
    await render(fake);

    await waitFor(() =>
      expect(fake.callTool.mock.calls.map(([name]) => name)).toContain(
        'x_workspace-manager_list_providers',
      ),
    );
    expect(screen.queryByText(/^Provider:/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-source-0')).not.toBeInTheDocument();

    await act(async () => release());
    expect(
      await screen.findByRole('button', { name: /Provider$/ }),
    ).toBeInTheDocument();
  });

  it('asks before discarding only once the person has edited the draft', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);
    const name = await screen.findByRole('textbox', { name: /^Name/ });
    const close = screen.getByRole('link', { name: 'Close' });

    fireEvent.click(close);
    expect(
      screen.queryByRole('dialog', { name: /Discard your changes/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'platform-mcp' } });
    fireEvent.click(close);
    expect(
      await screen.findByRole('dialog', { name: /Discard your changes/ }),
    ).toBeInTheDocument();
  });

  it('asks for the provider sign-in before the form when no instance is connected', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [UNGRANTED_GITLAB],
      repositories: LAB,
      grants: { [GITLAB_GRANT_SERVER]: 'auth_required' },
    });
    await render(fake);

    const gate = within(await screen.findByTestId('workspace-editor-gate'));
    expect(
      gate.getByText(/reads its repositories from gitlab-lab \(GitLab\)/),
    ).toBeInTheDocument();
    expect(
      gate.getByRole('button', { name: 'Sign in to GitLab ↗' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /^Name/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create workspace' }),
    ).not.toBeInTheDocument();
    expect(fake.callsOf('list_repositories')).toHaveLength(0);
  });

  it('opens the form once the provider is granted in muster', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [UNGRANTED_GITLAB],
      repositories: LAB,
      grants: { [GITLAB_GRANT_SERVER]: 'auth_required' },
    });
    await render(fake);
    await screen.findByTestId('workspace-editor-gate');

    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in to GitLab ↗' }),
    );
    expect(await screen.findByText('Waiting for GitLab…')).toBeInTheDocument();
    expect(fake.signInServer).toHaveBeenCalledWith(GITLAB_GRANT_SERVER, 'lab');
    // The grant finishes in the other tab; muster reports it on its next read.
    fake.grants[GITLAB_GRANT_SERVER] = 'connected';
    fake.providers[0] = { ...GITLAB, connected: true };
    open.mockRestore();

    expect(
      await screen.findByRole('textbox', { name: /^Name/ }, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-editor-gate'),
    ).not.toBeInTheDocument();
  }, 15_000);

  it('shows the connect prompt in place of the owner for a source on an unconnected instance', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB, UNGRANTED_GITLAB],
      repositories: [...ACME, ...LAB],
      grants: { [GITLAB_GRANT_SERVER]: 'auth_required' },
    });
    await render(fake);

    await screen.findByTestId('workspace-source-0');
    fireEvent.click(source(0).getByRole('button', { name: /Provider/ }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'gitlab-lab (GitLab)' }),
    );
    const prompt = within(
      await screen.findByTestId('provider-connect-gitlab-lab'),
    );
    // The grant is muster's sign-in for the server the manager's `signIn` names.
    expect(
      prompt.getByText('Sign in to gitlab-lab (GitLab)'),
    ).toBeInTheDocument();
    expect(
      prompt.getByRole('button', { name: 'Sign in to GitLab ↗' }),
    ).toBeInTheDocument();
    expect(
      source(0).queryByRole('textbox', { name: /^Owner/ }),
    ).not.toBeInTheDocument();
    expect(fake.callsOf('list_repositories')).toHaveLength(0);
  });

  it('asks for the sign-in to workspace-manager before the form', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      managerSignIn: 'auth_required',
    });
    await render(fake);

    const gate = within(await screen.findByTestId('workspace-editor-gate'));
    expect(gate.getByText('Sign in to use workspaces')).toBeInTheDocument();
    expect(gate.getByText(/has not signed in to it yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /^Name/ }),
    ).not.toBeInTheDocument();
    expect(fake.callsOf('list_repositories')).toHaveLength(0);
    expect(fake.callsOf('preview_workspace')).toHaveLength(0);
  });

  it('says whether a name is free once typing pauses', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [
        {
          name: 'taken',
          organization: 'acme',
          sources: [],
          sync: { schedule: 'nightly' },
          resourceVersion: '1',
          createdAt: '2026-10-01T00:00:00Z',
          repositories: 0,
          sessions: 0,
        },
      ],
    });
    await render(fake);
    const name = await screen.findByRole('textbox', { name: /^Name/ });

    fireEvent.change(name, { target: { value: 'platform-mcp' } });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(
      await screen.findByText('platform-mcp is available'),
    ).toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'taken' } });
    fireEvent.blur(name);
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining('A workspace named taken exists on lab.'),
      ),
    );

    // An invalid name says so once typing pauses, with one to try.
    fireEvent.change(name, { target: { value: 'Platform MCP' } });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining('Try “platform-mcp”.'),
      ),
    );
  });

  it('opens an existing workspace with its filters and saves the change', async () => {
    const stored: Workspace = {
      name: 'platform-mcp',
      organization: 'acme',
      sources: [
        {
          provider: 'github',
          owner: 'acme',
          filters: {
            languages: ['Go'],
            topics: { match: 'all', names: ['mcp'] },
          },
          exclude: ['mcp-prometheus'],
        },
      ],
      sync: { schedule: 'nightly' },
      resourceVersion: '7',
      createdAt: '2026-10-01T00:00:00Z',
      repositories: 1,
      sessions: 0,
    };
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [stored],
    });
    await render(fake, { name: 'platform-mcp' });
    await screen.findByTestId('workspace-source-0');
    // The name cannot change, so it is the page's title, not a field.
    expect(
      screen.queryByRole('textbox', { name: /^Name/ }),
    ).not.toBeInTheDocument();

    expect(
      await source(0).findByRole('button', { name: 'Language: Go' }),
    ).toBeInTheDocument();
    fireEvent.click(
      source(0).getByRole('button', { name: 'Topics: all of mcp' }),
    );
    expect(
      await screen.findByRole('radio', { name: 'All of', checked: true }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Any of' }));
    await closePopover();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fake.callsOf('update_workspace')).toHaveLength(1),
    );
    expect(fake.callsOf('update_workspace')[0]).toEqual({
      name: 'platform-mcp',
      resourceVersion: '7',
      sizing: {},
      sources: [
        {
          provider: 'github',
          owner: 'acme',
          filters: {
            languages: ['Go'],
            topics: { match: 'any', names: ['mcp'] },
          },
          exclude: ['mcp-prometheus'],
        },
      ],
    });
    expect(fake.callsOf('update_workspace')[0]).not.toHaveProperty('sync');
    // An edit closes to the workspace's page, the address's parent.
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/customize/workspaces/lab/acme/platform-mcp',
      ),
    );
  });
});

describe('RepositoryPicker against an owner of 500 repositories', () => {
  it('searches, filters, pages and selects all matches without the full listing', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: manyRepositories('github', 'big', 500),
    });
    await render(fake);

    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'big' },
    });
    fireEvent.change(source(0).getByRole('textbox', { name: /^Owner/ }), {
      target: { value: 'big' },
    });
    const picker = () => within(source(0).getByTestId('repository-picker'));
    expect(await picker().findByText('(500)')).toBeInTheDocument();
    expect(picker().getByText('Page 1 of 20')).toBeInTheDocument();

    fireEvent.click(picker().getByRole('button', { name: 'Next' }));
    expect(
      await picker().findByRole('checkbox', { name: 'repo-025' }),
    ).toBeInTheDocument();

    // Filter: Go only, server-side, its matches first.
    await pickFilter(0, 'Language', 'Go');
    expect(
      await source(0).findByTestId('filter-match-total'),
    ).toHaveTextContent('167 repositories match');
    expect(
      await picker().findByText('Page 1 of 27, matches first'),
    ).toBeInTheDocument();

    // Search by name: server-side, and select all its matches.
    fireEvent.change(picker().getByRole('searchbox'), {
      target: { value: 'repo-04' },
    });
    expect(
      await picker().findByText('10 of 500 match the search'),
    ).toBeInTheDocument();
    fireEvent.click(
      picker().getByRole('button', { name: 'Select all 10 matches' }),
    );
    await waitFor(() =>
      expect(
        picker().getByRole('switch', { name: 'Selected only (10)' }),
      ).toBeInTheDocument(),
    );

    const listings = fake.callsOf('list_repositories');
    // Every browse is one page; no call ever asks for the whole owner.
    for (const call of listings) {
      expect(call.pageSize).toBeLessThanOrEqual(200);
    }
    const selectAll = listings.filter(call => call.pageSize === 200);
    expect(selectAll).toHaveLength(1);
    expect(selectAll[0]).toMatchObject({ search: 'repo-04' });
  });
});
