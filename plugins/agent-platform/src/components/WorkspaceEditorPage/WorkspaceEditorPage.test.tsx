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
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Workspace tools use the muster frontend API.
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
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
} from '@giantswarm/backstage-plugin-ui-react';

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

/** gitlab-lab as a multi-App registration names it: its own App in muster. */
const APP_GITLAB = {
  ...GITLAB,
  connected: false,
  signIn:
    'grant the App of provider gitlab-lab once in muster: core_auth_login app=gitlab-lab',
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
    <TestApiProvider
      apis={[
        [musterApiRef, musterApi],
        [externalUrlConsentApiRef, new ExternalUrlConsentManager(jest.fn())],
      ]}
    >
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

    // Any name: the technical name is filled in from it.
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Platform MCP' },
    });
    expect(
      screen.getByRole('textbox', { name: /^Name/ }),
    ).toHaveAccessibleDescription(
      'Its technical name is platform-mcp; it cannot be changed once the workspace exists.',
    );
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
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);

    const name = await screen.findByRole('textbox', { name: /^Name/ });
    await user.click(name);
    await user.tab();
    expect(
      screen.queryByText('Enter a name for the workspace.'),
    ).not.toBeInTheDocument();
    await user.click(name);
    await user.type(name, 'Platform');
    await user.clear(name);
    await user.tab();
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining('Enter a name for the workspace.'),
      ),
    );
    // A field not yet left stays quiet.
    expect(screen.queryByText('Choose an owner')).not.toBeInTheDocument();
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

  /**
   * The two shapes of workspace-manager's `signIn` for an ungranted instance:
   * muster's sign-in for the server the manager is pinned to, or for the
   * instance's own App (a multi-App registration). Both read the same in the
   * editor; only the sign-in muster is asked to start differs.
   */
  describe.each([
    {
      hint: 'server',
      provider: UNGRANTED_GITLAB,
      grant: { grants: { [GITLAB_GRANT_SERVER]: 'auth_required' as const } },
      target: GITLAB_GRANT_SERVER,
      finish: (fake: WorkspaceManagerFake) => {
        fake.grants[GITLAB_GRANT_SERVER] = 'connected';
      },
    },
    {
      hint: 'app',
      provider: APP_GITLAB,
      grant: { appGrants: { 'gitlab-lab': 'auth_required' as const } },
      target: { app: 'gitlab-lab' },
      finish: (fake: WorkspaceManagerFake) => {
        fake.appGrants['gitlab-lab'] = 'connected';
      },
    },
  ])(
    'with a core_auth_login $hint= sign-in',
    ({ provider, grant, target, finish }) => {
      let open: jest.SpyInstance;
      beforeEach(() => {
        open = jest.spyOn(window, 'open').mockReturnValue(null);
      });
      afterEach(() => {
        open.mockRestore();
      });

      it('asks for the provider sign-in before the form when no instance is connected', async () => {
        const fake = createWorkspaceManagerFake({
          providers: [provider],
          repositories: LAB,
          ...grant,
        });
        await render(fake);

        const gate = within(await screen.findByTestId('workspace-editor-gate'));
        expect(
          gate.getByText(/reads its repositories from gitlab-lab \(GitLab\)/),
        ).toBeInTheDocument();
        expect(
          gate.getByRole('button', {
            name: 'Sign in to GitLab (opens in a new tab)',
          }),
        ).toBeInTheDocument();
        expect(gate.queryByText(/core_auth_login/)).not.toBeInTheDocument();
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
          providers: [provider],
          repositories: LAB,
          ...grant,
        });
        await render(fake);
        await screen.findByTestId('workspace-editor-gate');

        fireEvent.click(
          screen.getByRole('button', {
            name: 'Sign in to GitLab (opens in a new tab)',
          }),
        );
        expect(
          await screen.findByText('Waiting for GitLab…'),
        ).toBeInTheDocument();
        // The hint's own sign-in, and no other.
        expect(fake.signInServer.mock.calls).toEqual([[target, 'lab']]);
        // The grant finishes in the other tab; muster reports it on its next read.
        finish(fake);
        fake.providers[0] = { ...GITLAB, connected: true };

        expect(
          await screen.findByRole(
            'textbox',
            { name: /^Name/ },
            { timeout: 8000 },
          ),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId('workspace-editor-gate'),
        ).not.toBeInTheDocument();
      }, 15_000);

      it('shows the connect prompt in place of the owner for a source on an unconnected instance', async () => {
        const fake = createWorkspaceManagerFake({
          providers: [GITHUB, provider],
          repositories: [...ACME, ...LAB],
          ...grant,
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
        expect(
          prompt.getByText('Sign in to gitlab-lab (GitLab)'),
        ).toBeInTheDocument();
        expect(prompt.queryByText(/core_auth_login/)).not.toBeInTheDocument();
        expect(
          source(0).queryByRole('textbox', { name: /^Owner/ }),
        ).not.toBeInTheDocument();
        expect(fake.callsOf('list_repositories')).toHaveLength(0);

        fireEvent.click(
          prompt.getByRole('button', {
            name: 'Sign in to GitLab (opens in a new tab)',
          }),
        );
        await waitFor(() =>
          expect(fake.signInServer.mock.calls).toEqual([[target, 'lab']]),
        );
      });
    },
  );

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
  });

  it('takes a technical name of the person’s own, and checks it there', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);
    const name = await screen.findByRole('textbox', { name: /^Name/ });
    fireEvent.change(name, { target: { value: 'Platform MCP' } });

    fireEvent.click(screen.getByRole('button', { name: 'Advanced options' }));
    const technical = await screen.findByRole('textbox', {
      name: /^Technical name/,
    });
    expect(technical).toHaveValue('platform-mcp');

    // An invalid technical name says so once typing pauses, with one to try.
    fireEvent.change(technical, { target: { value: 'Bad_Name' } });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() =>
      expect(technical).toHaveAccessibleDescription(
        expect.stringContaining('Try “bad-name”.'),
      ),
    );
    expect(name).not.toHaveAccessibleDescription(
      expect.stringContaining('Try'),
    );

    // An invalid technical name is not stated as the one it will get.
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining('Its technical name is filled in from it'),
    );

    // From then on the name no longer changes it.
    fireEvent.change(technical, { target: { value: 'mcp-servers' } });
    fireEvent.change(name, { target: { value: 'Something else' } });
    expect(technical).toHaveValue('mcp-servers');
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining('Its technical name is mcp-servers'),
    );

    // Cleared, it is the name's again.
    fireEvent.change(technical, { target: { value: '' } });
    fireEvent.change(name, { target: { value: 'Team repos' } });
    expect(technical).toHaveValue('team-repos');
  });

  it('opens Advanced options when the technical name blocks the save', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);
    // A name with no Latin letter or digit leaves no technical name.
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: '日本チーム' },
    });
    const advanced = screen.getByRole('button', { name: 'Advanced options' });
    expect(advanced).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() =>
      expect(advanced).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(
      screen.getByRole('textbox', { name: /^Technical name/ }),
    ).toHaveAccessibleDescription(
      expect.stringContaining('Enter a technical name.'),
    );
    expect(fake.callsOf('create_workspace')).toHaveLength(0);
  });

  it('asks for a name even with a technical name typed', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);
    const name = await screen.findByRole('textbox', { name: /^Name/ });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced options' }));
    fireEvent.change(
      await screen.findByRole('textbox', { name: /^Technical name/ }),
      { target: { value: 'mcp-servers' } },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining('Enter a name for the workspace.'),
      ),
    );
    expect(fake.callsOf('create_workspace')).toHaveLength(0);
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
    // The picker, open on the picks, shows an excluded pick as out.
    await user.keyboard('{Escape}');
    expect(
      source(0).getByRole('checkbox', { name: 'Include app-2' }),
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
      await source(0).findByRole('switch', { name: /Show selected only/ }),
    );
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

describe('WorkspaceEditorPage blocked save', () => {
  it('leaves an empty Owner quiet when tabbed through, then names it and focuses it on save', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      owners: { github: ['acme'] },
    });
    await render(fake);

    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'platform-mcp' },
    });
    const owner = await source(0).findByRole('button', { name: /Owner/ });
    act(() => owner.focus());
    await user.tab();
    expect(owner).not.toHaveFocus();
    expect(owner).toHaveTextContent('Choose an owner');
    expect(owner).toHaveAccessibleDescription('');

    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(owner).toHaveFocus());
    expect(owner).toHaveAccessibleDescription(
      expect.stringContaining('Choose an owner'),
    );
    // Nothing can be picked before the owner is chosen.
    expect(
      screen.queryByText(
        'Pick repositories by name, or filter by language or topic',
      ),
    ).not.toBeInTheDocument();
    expect(fake.callsOf('create_workspace')).toHaveLength(0);

    await user.click(owner);
    await user.click(await screen.findByRole('option', { name: 'acme' }));
    expect(owner).toHaveAccessibleDescription('');
    expect(
      await source(0).findByText(
        'Pick repositories by name, or filter by language or topic',
      ),
    ).toBeInTheDocument();
  });

  it('names an empty Provider when there are several and focuses it', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB, GITLAB],
      repositories: [...ACME, ...LAB],
    });
    await render(fake);

    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'mixed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    const provider = await source(0).findByRole('button', {
      name: /Provider/,
    });
    expect(provider).toHaveTextContent('Choose a provider');
    await waitFor(() => expect(provider).toHaveFocus());
    expect(provider).toHaveAccessibleDescription(
      expect.stringContaining('Choose a provider'),
    );
  });

  it('opens Advanced options and focuses Minimum size when only it holds a problem', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ repositories: ['portal'] })],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');

    const advanced = screen.getByRole('button', { name: 'Advanced options' });
    fireEvent.click(advanced);
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Minimum size' }),
      { target: { value: '2O' } },
    );
    fireEvent.click(advanced);
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Minimum size' }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const minimum = await screen.findByRole('textbox', {
      name: 'Minimum size',
    });
    await waitFor(() => expect(minimum).toHaveFocus());
    expect(minimum).toHaveAccessibleDescription(
      expect.stringContaining('Enter a whole number of GiB, such as 20'),
    );
    expect(
      screen.getByRole('button', { name: 'Advanced options' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(fake.callsOf('update_workspace')).toHaveLength(0);
  });

  it('opens the source a refusal names when another source is open', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB, GITLAB],
      repositories: [...ACME, ...LAB],
      workspaces: [
        {
          ...storedWorkspace({ repositories: ['portal'] }),
          sources: [
            { provider: 'github', owner: 'acme', repositories: ['portal'] },
            {
              provider: 'gitlab-lab',
              owner: 'platform',
              repositories: ['charts'],
            },
          ],
        },
      ],
    });
    fake.onWrite('update_workspace', () => {
      throw new Error(
        'update_workspace: invalid workspace: Workspace.workspace-manager.giantswarm.io "portal" is invalid: spec.sources[0].owner: Invalid value: "acme": owner must be a provider account name',
      );
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-1');
    fireEvent.click(
      await source(1).findByRole('button', { name: 'Edit source' }),
    );
    expect(
      await source(0).findByRole('button', { name: 'Edit source' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const owner = await source(0).findByRole('textbox', { name: /^Owner/ });
    await waitFor(() =>
      expect(owner).toHaveAccessibleDescription(
        expect.stringContaining('owner must be a provider account name'),
      ),
    );
    await waitFor(() => expect(owner).toHaveFocus());
  });

  it('announces a refusal that names no field', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ repositories: ['portal'] })],
    });
    fake.onWrite('update_workspace', () => {
      throw new Error('update_workspace: the manager is read-only');
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The workspace was not saved',
    );
  });

  it('announces the problem of a field the person leaves', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ repositories: ['portal'] })],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');

    await user.click(screen.getByRole('button', { name: 'Advanced options' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Minimum size' }),
      '2O',
    );
    await user.tab();

    await waitFor(() =>
      expect(
        document.querySelector('[data-field-validation-announcer]'),
      ).toHaveTextContent('Enter a whole number of GiB, such as 20'),
    );
  });
});

describe('WorkspaceEditorPage in the edit flow', () => {
  it('opens the repository table on the picks by name', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ repositories: ['portal', 'operator'] })],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');

    const picker = within(await source(0).findByTestId('repository-picker'));
    expect(
      picker.getAllByRole('columnheader').map(header => header.textContent),
    ).toEqual(['Repository', 'Selection']);
    expect(
      picker.getByRole('switch', { name: 'Show selected only (2)' }),
    ).toBeChecked();
    expect(picker.getByRole('checkbox', { name: 'portal' })).toBeChecked();
    expect(picker.getByRole('checkbox', { name: 'operator' })).toBeChecked();
    expect(picker.queryByRole('searchbox')).not.toBeInTheDocument();

    fireEvent.click(picker.getByRole('switch', { name: /Show selected only/ }));
    expect(await picker.findByRole('searchbox')).toBeInTheDocument();
  });

  it('opens a source without picks by name on the owner listing', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ filters: { languages: ['Go'] } })],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');

    const picker = within(await source(0).findByTestId('repository-picker'));
    expect(
      picker.getByRole('switch', { name: /Show selected only/ }),
    ).not.toBeChecked();
    expect(picker.getByRole('searchbox')).toBeInTheDocument();
  });

  it('closes and cancels to the workspace page', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ repositories: ['portal'] })],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');

    for (const name of ['Close', 'Cancel']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        '/customize/workspaces/lab/acme/portal',
      );
    }
  });

  it('cancels a new workspace to the Workspaces tab', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);
    await screen.findByTestId('workspace-source-0');

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/customize/workspaces?organization=acme',
    );
  });
});

describe('WorkspaceEditorPage wording by control', () => {
  it('asks to enter an owner when the owner is typed, and to enter a name', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    await render(fake);

    const name = await screen.findByRole('textbox', { name: /^Name/ });
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining(
        'it cannot be changed once the workspace exists.',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining('Enter a name'),
      ),
    );
    expect(name).toHaveFocus();
    const owner = source(0).getByRole('textbox', { name: /^Owner/ });
    expect(owner).toHaveAccessibleDescription(
      expect.stringContaining('Enter an owner'),
    );
    expect(screen.queryByText('Choose an owner')).not.toBeInTheDocument();
  });
});

describe('WorkspaceEditorPage without providers', () => {
  function withoutListProviders(fake: WorkspaceManagerFake) {
    const answer = fake.callTool.getMockImplementation()!;
    fake.callTool.mockImplementation(async (name: string, args) => {
      if (name.endsWith('list_providers')) {
        throw new Error(
          'Tool execution failed: tool not found: x_workspace-manager_list_providers',
        );
      }
      return answer(name, args);
    });
  }

  it('says why no source can be saved, names no provider field, and focuses the warning on a blocked save', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    withoutListProviders(fake);
    await render(fake);

    const warning = await screen.findByText('Could not read the providers');
    expect(
      screen.getByText(
        'A source needs a provider, so the workspace cannot be saved until the providers can be read. Try again later, or ask your platform team.',
      ),
    ).toBeInTheDocument();
    const details = screen.getByText(
      'Tool execution failed: tool not found: x_workspace-manager_list_providers',
    );
    expect(details).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));
    expect(details).toBeVisible();

    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'platform-mcp' },
    });
    fireEvent.change(source(0).getByRole('textbox', { name: /^Owner/ }), {
      target: { value: 'acme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    const holder = warning.closest('[tabindex="-1"]');
    await waitFor(() => expect(holder).toHaveFocus());
    expect(screen.queryByText('Choose a provider')).not.toBeInTheDocument();
    expect(fake.callsOf('create_workspace')).toHaveLength(0);
  });

  it('focuses a field that can be fixed before the warning', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
    });
    withoutListProviders(fake);
    await render(fake);
    await screen.findByText('Could not read the providers');

    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'platform-mcp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    const owner = source(0).getByRole('textbox', { name: /^Owner/ });
    await waitFor(() => expect(owner).toHaveFocus());
    expect(owner).toHaveAccessibleDescription(
      expect.stringContaining('Enter an owner'),
    );
  });

  it('keeps an edit whose sources name their provider savable', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ repositories: ['portal'] })],
    });
    withoutListProviders(fake);
    await render(fake, { name: 'portal' });

    expect(
      await screen.findByText('Could not read the providers'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/the workspace cannot be saved/),
    ).not.toBeInTheDocument();
    const details = screen.getByText(
      'Tool execution failed: tool not found: x_workspace-manager_list_providers',
    );
    expect(details).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));
    expect(details).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fake.callsOf('update_workspace')).toHaveLength(1),
    );
  });

  it('shows the manager refusing the provider a source names', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [storedWorkspace({ repositories: ['portal'] })],
    });
    withoutListProviders(fake);
    fake.onWrite('update_workspace', () => {
      throw new Error(
        'update_workspace: invalid workspace: sources[0]: unknown provider instance "github"',
      );
    });
    await render(fake, { name: 'portal' });
    await screen.findByText('Could not read the providers');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await source(0).findByRole('alert')).toHaveTextContent(
      /unknown provider instance/,
    );
  });

  it('says so when no provider is configured', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [],
      repositories: ACME,
    });
    await render(fake);

    expect(
      await screen.findByText('No provider to pick from'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A source needs a provider, and none is configured on lab. Ask your platform team to add one.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: /^Name/ }),
      ).toHaveAccessibleDescription(expect.stringContaining('Enter a name')),
    );
    expect(screen.queryByText('Choose a provider')).not.toBeInTheDocument();
  });
});

describe('WorkspaceEditorPage selected repository membership', () => {
  it('excludes a removed pick that also matches a filter from the preview and save', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [
        storedWorkspace({
          repositories: ['operator'],
          filters: { languages: ['Go'] },
        }),
      ],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');
    const picker = within(await source(0).findByTestId('repository-picker'));
    await user.click(picker.getByRole('checkbox', { name: 'operator' }));
    const excluded = picker.getByRole('checkbox', { name: 'Include operator' });
    expect(excluded).not.toBeChecked();
    expect(excluded).toHaveFocus();
    await settlePreview();
    const preview = within(screen.getByTestId('workspace-preview'));
    await waitFor(() =>
      expect(preview.queryByText('acme/operator')).not.toBeInTheDocument(),
    );
    expect(await preview.findByText('acme/mcp-kubernetes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fake.callsOf('update_workspace')).toHaveLength(1),
    );
    expect(fake.callsOf('update_workspace')[0].sources[0]).toMatchObject({
      filters: { languages: ['Go'] },
      exclude: ['operator'],
    });
  });

  it.each([undefined, { languages: ['Go'] }])(
    'includes an excluded name even when it matches no filter (%j)',
    async filters => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const fake = createWorkspaceManagerFake({
        providers: [GITHUB],
        repositories: ACME,
        workspaces: [
          storedWorkspace({
            repositories: ['operator'],
            exclude: ['portal'],
            filters,
          }),
        ],
      });
      await render(fake, { name: 'portal' });
      await screen.findByTestId('workspace-source-0');
      const picker = within(await source(0).findByTestId('repository-picker'));
      await user.click(
        picker.getByRole('checkbox', { name: 'Include portal' }),
      );
      const included = picker.getByRole('checkbox', { name: 'portal' });
      expect(included).toBeChecked();
      expect(included).toHaveFocus();
      await settlePreview();
      expect(
        await within(screen.getByTestId('workspace-preview')).findByText(
          'acme/portal',
        ),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() =>
        expect(fake.callsOf('update_workspace')).toHaveLength(1),
      );
      expect(
        fake.callsOf('update_workspace')[0].sources[0].repositories,
      ).toEqual(['operator', 'portal']);
      expect(
        fake.callsOf('update_workspace')[0].sources[0].exclude,
      ).toBeUndefined();
    },
  );

  it('moves keyboard focus to the next pick, the previous pick, and the view switch when empty', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fake = createWorkspaceManagerFake({
      providers: [GITHUB],
      repositories: ACME,
      workspaces: [
        storedWorkspace({
          repositories: ['portal', 'operator', 'mcp-kubernetes'],
        }),
      ],
    });
    await render(fake, { name: 'portal' });
    await screen.findByTestId('workspace-source-0');
    const picker = within(await source(0).findByTestId('repository-picker'));
    act(() => picker.getByRole('checkbox', { name: 'operator' }).focus());
    await user.keyboard(' ');
    expect(
      picker.getByRole('checkbox', { name: 'mcp-kubernetes' }),
    ).toHaveFocus();
    await user.keyboard(' ');
    expect(picker.getByRole('checkbox', { name: 'portal' })).toHaveFocus();
    await user.keyboard(' ');
    expect(
      picker.getByRole('switch', { name: 'Show selected only (0)' }),
    ).toHaveFocus();
    expect(
      picker.getByText('Nothing picked by name or excluded.'),
    ).toBeInTheDocument();
    await user.keyboard(' ');
    expect(await picker.findByRole('searchbox')).toBeInTheDocument();
  });
});
