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
  connectURL: '',
};
const GITLAB = {
  name: 'gitlab-lab',
  kind: 'gitlab',
  connected: true,
  connectURL: '',
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
  );
}

function source(index: number) {
  return within(screen.getByTestId(`workspace-source-${index}`));
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
    fireEvent.click(await source(0).findByRole('button', { name: 'Go' }));
    fireEvent.click(source(0).getByRole('button', { name: 'mcp' }));
    await settlePreview();

    const preview = within(screen.getByTestId('workspace-preview'));
    expect(await preview.findByText('acme/mcp-kubernetes')).toBeInTheDocument();
    expect(preview.getByText('acme/mcp-prometheus')).toBeInTheDocument();
    expect(preview.queryByText('acme/portal')).not.toBeInTheDocument();
    expect(preview.getByTestId('preview-total')).toHaveTextContent(
      '2 repositories',
    );

    fireEvent.click(
      preview.getByRole('button', { name: 'Exclude acme/mcp-prometheus' }),
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
    fireEvent.click(source(0).getByRole('checkbox', { name: /Forks count/ }));
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
    fireEvent.click(
      await screen.findByRole('option', { name: 'github (github)' }),
    );
    fireEvent.change(source(0).getByRole('textbox', { name: /^Owner/ }), {
      target: { value: 'acme' },
    });
    fireEvent.click(await source(0).findByRole('button', { name: 'Go' }));

    // Source 2: gitlab-lab / platform, one repository by name.
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    fireEvent.click(source(1).getByRole('button', { name: /Provider/ }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'gitlab-lab (gitlab)' }),
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

  it('has no schedule field, and says how the mirrors sync', async () => {
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
    expect(screen.getByText(/There is no schedule/)).toBeInTheDocument();
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

  it('shows the connect prompt in place of the owner for an unconnected provider', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [{ ...GITLAB, connected: false }],
      repositories: LAB,
    });
    await render(fake);

    expect(
      await screen.findByTestId('provider-connect-gitlab-lab'),
    ).toBeInTheDocument();
    expect(
      source(0).queryByRole('textbox', { name: /^Owner/ }),
    ).not.toBeInTheDocument();
    expect(fake.callsOf('list_repositories')).toHaveLength(0);
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

    expect(
      await source(0).findByRole('button', { name: 'Go', pressed: true }),
    ).toBeInTheDocument();
    expect(
      source(0).getByRole('button', { name: 'mcp', pressed: true }),
    ).toBeInTheDocument();
    expect(
      source(0).getByRole('radio', { name: 'All of', checked: true }),
    ).toBeInTheDocument();

    fireEvent.click(source(0).getByRole('radio', { name: 'Any of' }));
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
    expect(await picker().findByText('500 repositories')).toBeInTheDocument();
    expect(picker().getByText('Page 1 of 20')).toBeInTheDocument();

    fireEvent.click(picker().getByRole('button', { name: 'Next' }));
    expect(
      await picker().findByRole('checkbox', { name: 'repo-025' }),
    ).toBeInTheDocument();

    // Search by name: server-side.
    fireEvent.change(picker().getByRole('searchbox'), {
      target: { value: 'repo-04' },
    });
    expect(
      await picker().findByText('10 of 500 repositories match'),
    ).toBeInTheDocument();

    // Filter: Go only, through the source's filter and "matching only".
    fireEvent.change(picker().getByRole('searchbox'), {
      target: { value: '' },
    });
    fireEvent.click(source(0).getByRole('button', { name: 'Go' }));
    fireEvent.click(
      await picker().findByRole('switch', {
        name: 'Matching the filters only',
      }),
    );
    expect(
      await picker().findByText('167 of 500 repositories match'),
    ).toBeInTheDocument();

    fireEvent.click(
      picker().getByRole('button', { name: 'Select all 167 matches' }),
    );
    await waitFor(() =>
      expect(
        picker().getByRole('switch', { name: 'Selected only (167)' }),
      ).toBeInTheDocument(),
    );

    const listings = fake.callsOf('list_repositories');
    // Every browse is one page; no call ever asks for the whole owner.
    for (const call of listings) {
      expect(call.pageSize).toBeLessThanOrEqual(200);
    }
    const selectAll = listings.filter(call => call.pageSize === 200);
    expect(selectAll).toHaveLength(1);
    expect(selectAll[0]).toMatchObject({ languages: ['Go'], fork: false });
  });
});
