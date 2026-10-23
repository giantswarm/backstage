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
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import type { Workspace, WorkspaceSource } from '../../lib/workspaceManager';
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
    // The exclusion shows in the source's exclusions, to remove there too.
    expect(
      within(source(0).getByTestId('source-exclusions')).getByRole('row', {
        name: 'mcp-prometheus',
      }),
    ).toBeInTheDocument();
    // With filters only the manager knows what an exclusion drops.
    expect(source(0).getByTestId('repository-summary')).toHaveTextContent(
      '2 by filter · 0 by name · counting…',
    );
    await settlePreview();
    await waitFor(() =>
      expect(source(0).getByTestId('repository-summary')).toHaveTextContent(
        '2 by filter · 0 by name · 1 excluded = 1 repository',
      ),
    );
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

  it('names the minimum disk size with its unit', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Advanced options' }),
    );
    expect(
      await screen.findByRole('textbox', { name: 'Minimum size' }),
    ).toHaveAccessibleDescription(
      /^The disk never gets smaller than this many GiB\./,
    );
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
    expect(
      gate.getByText(/have not signed in to workspaces on /),
    ).toBeInTheDocument();
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

/** A stored workspace of one github source on acme. */
function storedWorkspace(selection: Partial<WorkspaceSource>): Workspace {
  return {
    name: 'portal',
    organization: 'acme',
    sources: [{ provider: 'github', owner: 'acme', ...selection }],
    sync: { schedule: 'nightly' },
    resourceVersion: '7',
    createdAt: '2026-10-01T00:00:00Z',
    repositories: 0,
    sessions: 0,
  };
}

const exclusions = () => within(source(0).getByTestId('source-exclusions'));

describe('WorkspaceEditorPage exclusions', () => {
  const APPS = Array.from({ length: 7 }, (_, i) =>
    repo('github', 'acme', `app-${i + 1}`, 'Go'),
  );
  const OLD = Array.from({ length: 8 }, (_, i) =>
    repo('github', 'acme', `old-${i + 1}`, 'Go'),
  );

  it('counts 7 picks by name as 7 when none of the 8 exclusions names one', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: [...APPS, ...OLD],
      workspaces: [
        storedWorkspace({
          repositories: APPS.map(r => r.name),
          exclude: OLD.map(r => r.name),
        }),
      ],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');
    await settlePreview();

    expect(
      await source(0).findByTestId('repository-summary'),
    ).toHaveTextContent(/^7 by name = 7 repositories$/);
    expect(exclusions().getByTestId('exclusion-effect')).toHaveTextContent(
      'Nothing is left out: the 8 exclusions match nothing the source selects.',
    );
    const tags = within(
      exclusions().getByRole('grid', { name: 'Excluded repositories' }),
    ).getAllByRole('row');
    expect(tags).toHaveLength(8);
    // The medium tag: 12px text.
    expect(tags[0]).toHaveAttribute('data-size', 'medium');
    expect(
      await screen.findByText('1 source on 1 provider · 7 repositories'),
    ).toBeInTheDocument();
    const preview = within(screen.getByTestId('workspace-preview'));
    expect(await preview.findByTestId('preview-total')).toHaveTextContent(
      '7 repositories',
    );
    expect(preview.queryByText(/excluded/)).not.toBeInTheDocument();
  });

  it('adds an exclusion from the selection and one by name, removes one, previews and saves them', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: [...APPS.slice(0, 3), OLD[0]],
      workspaces: [
        storedWorkspace({
          repositories: ['app-1', 'app-2', 'app-3'],
          exclude: ['old-1'],
        }),
      ],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');
    await settlePreview();
    expect(
      await source(0).findByTestId('repository-summary'),
    ).toHaveTextContent('3 by name = 3 repositories');

    // Remove: the tag's own button.
    fireEvent.click(exclusions().getByRole('button', { name: /old-1/ }));
    expect(exclusions().getByText('Nothing excluded.')).toBeInTheDocument();

    // Add from what the source selects now, as the manager resolves it.
    const field = exclusions().getByRole('combobox', {
      name: /^Exclude a repository/,
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(field);
    await user.type(field, 'app');
    await settlePreview();
    await user.click(await screen.findByRole('option', { name: /^app-2/ }));
    await waitFor(() =>
      expect(source(0).getByTestId('repository-summary')).toHaveTextContent(
        '3 by name · 1 excluded = 2 repositories',
      ),
    );
    expect(exclusions().getByTestId('exclusion-effect')).toHaveTextContent(
      '1 repository left out.',
    );
    // The picker shows an excluded pick as out.
    await user.keyboard('{Escape}');
    expect(
      source(0).getByRole('checkbox', { name: 'app-2' }),
    ).not.toBeChecked();

    // Add a name the source does not select: the manager keeps it.
    await user.click(field);
    await user.type(field, 'future-repo');
    // Before the answer for this search is in, the option claims nothing.
    expect(
      await screen.findByRole('option', { name: /^Exclude “future-repo”/ }),
    ).not.toHaveAccessibleDescription(/Not among/);
    await settlePreview();
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: /^Exclude “future-repo”/ }),
      ).toHaveAccessibleDescription(
        'Not among the repositories the source selects now',
      ),
    );
    await user.click(
      screen.getByRole('option', { name: /^Exclude “future-repo”/ }),
    );
    await waitFor(() =>
      expect(exclusions().getByTestId('exclusion-effect')).toHaveTextContent(
        '1 repository left out; 1 exclusion matches nothing the source selects: future-repo.',
      ),
    );

    // The list opens again for the next one; Escape closes it.
    await user.keyboard('{Escape}');
    await settlePreview();
    const preview = within(screen.getByTestId('workspace-preview'));
    await waitFor(() =>
      expect(preview.getByTestId('preview-total')).toHaveTextContent(
        '2 repositories',
      ),
    );
    expect(preview.getByText(/1 excluded/)).toBeInTheDocument();
    expect(preview.queryByText('acme/app-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fake.callsOf('update_workspace')).toHaveLength(1),
    );
    expect(fake.callsOf('update_workspace')[0].sources).toEqual([
      {
        provider: 'github',
        owner: 'acme',
        repositories: ['app-1', 'app-2', 'app-3'],
        exclude: ['app-2', 'future-repo'],
      },
    ]);
  });

  it("counts a filter's matches with the manager: an exclusion drops a pick by name too, and one that names nothing selected drops nothing", async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [
        storedWorkspace({
          filters: { languages: ['Go'] },
          repositories: ['portal'],
          exclude: ['mcp-prometheus', 'portal', 'gone'],
        }),
      ],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');
    await settlePreview();

    // Go: mcp-kubernetes, mcp-prometheus and operator; by name: portal.
    // mcp-prometheus and portal are excluded, gone matches nothing.
    await waitFor(() =>
      expect(source(0).getByTestId('repository-summary')).toHaveTextContent(
        '3 by filter · 1 by name · 2 excluded = 2 repositories',
      ),
    );
    expect(exclusions().getByTestId('exclusion-effect')).toHaveTextContent(
      '2 repositories left out; 1 exclusion matches nothing the source selects.',
    );
    const preview = within(screen.getByTestId('workspace-preview'));
    expect(await preview.findByTestId('preview-total')).toHaveTextContent(
      '2 repositories',
    );
  });
});

describe('WorkspaceEditorPage exclusion counts the form cannot know', () => {
  it('says the total is not known for a source on a provider instance the installation does not configure', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [
        {
          ...storedWorkspace({ repositories: ['portal'] }),
          sources: [
            { provider: 'github', owner: 'acme', repositories: ['portal'] },
            {
              provider: 'retired',
              owner: 'acme',
              filters: { languages: ['Go'] },
              exclude: ['operator'],
            },
          ],
        },
      ],
    });
    await render(fake, { name: 'portal' });
    fireEvent.click(
      within(await screen.findByTestId('workspace-source-1')).getByRole(
        'button',
        { name: 'Edit source' },
      ),
    );
    await settlePreview();

    await waitFor(() =>
      expect(source(1).getByTestId('repository-summary')).toHaveTextContent(
        /^0 by name · total not known$/,
      ),
    );
  });

  it('leaves out the by-filter count for topics that must all match, which the listing cannot count', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: [
        ...ACME,
        repo('github', 'acme', 'charts-mcp', 'Go', ['mcp', 'helm']),
      ],
      workspaces: [
        storedWorkspace({
          filters: { topics: { match: 'all', names: ['mcp', 'helm'] } },
        }),
      ],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');
    await settlePreview();

    // The listing's "any of" would count 4; the manager selects 1.
    await waitFor(() =>
      expect(source(0).getByTestId('repository-summary')).toHaveTextContent(
        /^0 by name · 1 repository in all$/,
      ),
    );
    expect(
      source(0).queryByTestId('filter-match-total'),
    ).not.toBeInTheDocument();
  });

  it("ties the manager's refusal of the exclusions to the exclusion field", async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ repositories: ['portal'] })],
    });
    fake.onWrite('update_workspace', () => {
      throw new Error(
        'update_workspace: invalid workspace: spec.sources[0].exclude: Too many: 1001: must have at most 1000 items',
      );
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');
    fireEvent.click(
      await source(0).findByRole('checkbox', { name: 'operator' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(
        exclusions().getByRole('combobox', { name: /^Exclude a repository/ }),
      ).toHaveAccessibleDescription(
        expect.stringContaining('must have at most 1000 items'),
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
        picker().getByRole('switch', { name: 'Show selected only (10)' }),
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
