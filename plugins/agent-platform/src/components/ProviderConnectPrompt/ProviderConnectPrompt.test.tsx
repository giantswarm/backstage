import { useState } from 'react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useWorkspaceProviders } from '../../hooks/useWorkspaceEditor';
import { useWorkspaceManagerClient } from '../../hooks/useWorkspaceManager';
import type { WorkspaceProvider } from '../../lib/workspaceManager';
import {
  createWorkspaceManagerFake,
  type WorkspaceManagerFake,
} from '../WorkspaceEditorPage/workspaceManagerFake';
import { ProviderConnectPrompt } from './ProviderConnectPrompt';
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
} from '@giantswarm/backstage-plugin-ui-react';

/** Two provider instances of different kinds, each with its own App. */
const GITHUB: WorkspaceProvider = {
  name: 'github',
  kind: 'github',
  connected: false,
  signIn:
    'grant the App of provider github once in muster: core_auth_login app=github',
};
const GITLAB: WorkspaceProvider = {
  name: 'gitlab-lab',
  kind: 'gitlab',
  connected: false,
  signIn:
    'grant the App of provider gitlab-lab once in muster: core_auth_login app=gitlab-lab',
};

/**
 * A host as the composer is: a draft of its own, and a prompt for each
 * provider instance `list_providers` first read unconnected, kept until the
 * prompt says the instance is connected.
 */
function Host({ onConnected }: { onConnected: (name: string) => void }) {
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState<string[]>([]);
  const providers = useWorkspaceProviders(useWorkspaceManagerClient('lab'));
  const [asked, setAsked] = useState<WorkspaceProvider[]>();
  if (!asked && providers.data) {
    setAsked(providers.data.filter(p => !p.connected));
  }
  return (
    <>
      <textarea
        aria-label="Draft"
        value={draft}
        onChange={e => setDraft(e.target.value)}
      />
      {asked
        ?.filter(p => !connected.includes(p.name))
        .map(p => (
          <ProviderConnectPrompt
            key={p.name}
            installation="lab"
            provider={p}
            onConnected={() => {
              setConnected(prev => [...prev, p.name]);
              onConnected(p.name);
            }}
          />
        ))}
    </>
  );
}

/** The external URL consent dialog's queue; nothing answers unless a test does. */
let consent: ExternalUrlConsentManager;
beforeEach(() => {
  consent = new ExternalUrlConsentManager(jest.fn());
});

function renderHost(fake: WorkspaceManagerFake) {
  const onConnected = jest.fn();
  const musterApi = {
    callTool: fake.callTool,
    listServers: fake.listServers,
    listInstallations: fake.listInstallations,
    getAuthStatus: fake.getAuthStatus,
    signInServer: fake.signInServer,
  } as unknown as MusterApi;
  // The plugin's own defaults: an answer is fresh for a minute, and focus
  // refetches are off unless a query asks for them.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
    },
  });
  render(
    <TestApiProvider
      apis={[
        [musterApiRef, musterApi],
        [externalUrlConsentApiRef, consent],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <Host onConnected={onConnected} />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { onConnected };
}

/** The person comes back to the portal's tab from the sign-in tab. */
function returnFocus() {
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

function twoProviders() {
  return createWorkspaceManagerFake({
    providers: [{ ...GITHUB }, { ...GITLAB }],
    repositories: [],
    appGrants: { github: 'auth_required', 'gitlab-lab': 'auth_required' },
  });
}

afterEach(() => {
  focusManager.setFocused(undefined);
});

describe('ProviderConnectPrompt', () => {
  it('says what each provider instance asks of the person, in its own terms', async () => {
    renderHost(twoProviders());

    const github = await screen.findByTestId('provider-connect-github');
    expect(github).toHaveTextContent(
      'Allow Agent Platform to use GitHub as you',
    );
    expect(
      within(github).getByRole('button', { name: /Continue with GitHub/ }),
    ).toBeInTheDocument();
    const gitlab = screen.getByTestId('provider-connect-gitlab-lab');
    expect(gitlab).toHaveTextContent('Sign in to gitlab-lab (GitLab)');
    expect(
      within(gitlab).getByRole('button', { name: /Sign in to GitLab/ }),
    ).toBeInTheDocument();
  });

  it("shows muster's reason, and no sign-in, for a grant that cannot pass", async () => {
    const fake = twoProviders();
    const reason =
      "Cannot sign in to 'github': your login method cannot be checked here.";
    fake.getAuthStatus.mockResolvedValue({
      servers: [{ name: 'workspace-manager', status: 'connected' }],
      providerApps: [
        { name: 'github', status: 'auth_required', error: reason },
        {
          name: 'gitlab-lab',
          status: 'auth_required',
          auth_tool: 'core_auth_login',
        },
      ],
    });
    renderHost(fake);

    const github = await screen.findByTestId('provider-connect-github');
    expect(await within(github).findByText(reason)).toBeInTheDocument();
    expect(within(github).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('provider-connect-gitlab-lab')).getByRole(
        'button',
        { name: /Sign in to GitLab/ },
      ),
    ).toBeInTheDocument();
    expect(fake.signInServer).not.toHaveBeenCalled();
  });

  it("starts each instance's own App grant and connects it alone", async () => {
    const fake = twoProviders();
    const { onConnected } = renderHost(fake);

    const github = await screen.findByTestId('provider-connect-github');
    fireEvent.click(
      within(github).getByRole('button', { name: /Continue with GitHub/ }),
    );
    await waitFor(() =>
      expect(fake.signInServer).toHaveBeenCalledWith({ app: 'github' }, 'lab'),
    );
    await within(github).findByText('Waiting for GitHub…');
    // The other instance is untouched by this sign-in.
    const gitlab = screen.getByTestId('provider-connect-gitlab-lab');
    expect(
      within(gitlab).getByRole('button', { name: /Sign in to GitLab/ }),
    ).toBeInTheDocument();

    // The grant finishes in the other tab; the person comes back.
    fake.appGrants.github = 'connected';
    fake.providers[0] = { ...GITHUB, connected: true, signIn: undefined };
    returnFocus();

    await waitFor(() => expect(onConnected).toHaveBeenCalledWith('github'));
    expect(onConnected).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByTestId('provider-connect-github'),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId('provider-connect-gitlab-lab')).getByRole(
        'button',
        { name: /Sign in to GitLab/ },
      ),
    ).toBeInTheDocument();

    // The second instance connects on its own grant.
    fireEvent.click(
      within(screen.getByTestId('provider-connect-gitlab-lab')).getByRole(
        'button',
        { name: /Sign in to GitLab/ },
      ),
    );
    await waitFor(() =>
      expect(fake.signInServer).toHaveBeenCalledWith(
        { app: 'gitlab-lab' },
        'lab',
      ),
    );
    fake.appGrants['gitlab-lab'] = 'connected';
    fake.providers[1] = { ...GITLAB, connected: true, signIn: undefined };
    returnFocus();

    await waitFor(() => expect(onConnected).toHaveBeenCalledWith('gitlab-lab'));
    expect(onConnected).toHaveBeenCalledTimes(2);
  });

  it('reports no grant it did not start', async () => {
    const fake = twoProviders();
    const { onConnected } = renderHost(fake);
    await screen.findByTestId('provider-connect-github');

    // muster and list_providers already read the instance granted, while the
    // host still asks: only the person's own sign-in here says it is done.
    fake.appGrants.github = 'connected';
    fake.providers[0] = { ...GITHUB, connected: true, signIn: undefined };
    returnFocus();
    await waitFor(() =>
      expect(fake.getAuthStatus.mock.calls.length).toBeGreaterThan(1),
    );

    expect(onConnected).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId('provider-connect-github')).getByRole(
        'button',
        { name: /Continue with GitHub/ },
      ),
    ).toBeInTheDocument();
  });

  it('reads list_providers again when the person returns to the tab', async () => {
    const fake = twoProviders();
    renderHost(fake);
    await screen.findByTestId('provider-connect-github');
    const reads = () => fake.callsOf('list_providers');
    await waitFor(() => expect(reads().length).toBeGreaterThan(0));
    const before = reads().length;

    returnFocus();

    await waitFor(() => expect(reads().length).toBeGreaterThan(before));
  });

  it('keeps the host draft through the sign-in round trip', async () => {
    const fake = twoProviders();
    renderHost(fake);
    const draft = screen.getByRole('textbox', { name: 'Draft' });
    fireEvent.change(draft, { target: { value: 'List the repositories' } });

    const github = await screen.findByTestId('provider-connect-github');
    fireEvent.click(
      within(github).getByRole('button', { name: /Continue with GitHub/ }),
    );
    await within(github).findByText('Waiting for GitHub…');
    fake.appGrants.github = 'connected';
    fake.providers[0] = { ...GITHUB, connected: true, signIn: undefined };
    returnFocus();
    await waitFor(() =>
      expect(
        screen.queryByTestId('provider-connect-github'),
      ).not.toBeInTheDocument(),
    );

    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue(
      'List the repositories',
    );
  });

  it('asks before opening the sign-in, and offers it again when not opened', async () => {
    const authUrl = 'https://muster.lab.example.io/oauth/proxy/start?state=abc';
    const fake = createWorkspaceManagerFake({
      providers: [
        {
          ...GITHUB,
          signIn:
            'grant the App of provider github once in muster: core_auth_login server=workspace-manager',
        },
      ],
      repositories: [],
      managerSignIn: 'auth_required',
    });
    fake.signInServer.mockResolvedValueOnce({
      status: 'auth_required',
      authUrl,
      message: 'Sign in to workspace-manager.',
    } as never);
    renderHost(fake);

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue with GitHub/ }),
    );
    await waitFor(() => expect(consent.current()?.url).toBe(authUrl));
    act(() => consent.answer(consent.current()!.id, 'decline'));

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open the GitHub sign-in (opens in a new tab)',
      }),
    );

    expect(consent.current()?.url).toBe(authUrl);
    expect(fake.signInServer).toHaveBeenCalledTimes(1);
  });

  it('starts a grant through the server the manager is pinned to', async () => {
    const fake = createWorkspaceManagerFake({
      providers: [
        {
          ...GITHUB,
          signIn:
            'grant the App of provider github once in muster: core_auth_login server=workspace-manager',
        },
      ],
      repositories: [],
    });
    renderHost(fake);

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue with GitHub/ }),
    );

    await waitFor(() =>
      expect(fake.signInServer).toHaveBeenCalledWith(
        'workspace-manager',
        'lab',
      ),
    );
  });
});
