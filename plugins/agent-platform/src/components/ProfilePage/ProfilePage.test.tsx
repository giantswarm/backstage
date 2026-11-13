import { identityApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InstallationConfig } from '@giantswarm/backstage-plugin-gs';
import { ShellScopeProvider } from '@giantswarm/backstage-plugin-ui-react';
import { ProfilePage } from './ProfilePage';

let mockInstallations: Pick<InstallationConfig, 'name' | 'pipeline'>[] = [];
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: false,
  }),
}));

// Tested on its own; here it shows which environments the page hands it.
jest.mock('../EnvironmentToggles', () => ({
  EnvironmentToggles: ({ installations }: { installations: string[] }) => (
    <ul aria-label="Environment toggles">
      {installations.map(name => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  ),
}));

// muster's own component, tested in the muster plugin: here it lists the
// person's connections when muster keeps any App.
let mockHasApps = false;
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ProviderAppConnections: ({
    children,
  }: {
    children: (list: unknown) => unknown;
  }) => (mockHasApps ? children(<div>the person's connections</div>) : null),
}));

const signOut = jest.fn().mockResolvedValue(undefined);

async function renderPage(
  profile: { displayName?: string; email?: string } = {
    displayName: 'Jane Doe',
    email: 'jane@example.com',
  },
  config: { app?: { releaseVersion?: string } } = {},
) {
  // The app mounts the shell's pages inside `ShellScopeProvider`.
  await renderInTestApp(
    <ShellScopeProvider>
      <ProfilePage />
    </ShellScopeProvider>,
    {
      config,
      apis: [
        [
          identityApiRef,
          mockApis.identity.mock({
            getProfileInfo: async () => profile,
            signOut,
          }),
        ],
      ],
    },
  );
  // Wait for the identity to land, so the profile's state update stays
  // inside the test instead of warning after it.
  await screen.findByText(
    profile.displayName?.trim() || profile.email || 'Signed in',
  );
}

beforeEach(() => {
  mockHasApps = false;
  signOut.mockClear();
  mockInstallations = [{ name: 'gazelle', pipeline: 'testing' }];
});

describe('ProfilePage', () => {
  it("lists the person's connections", async () => {
    mockHasApps = true;
    await renderPage();

    const section = screen.getByRole('region', { name: 'Connections' });
    expect(section).toHaveTextContent("the person's connections");
    expect(section).toHaveTextContent(/your ChatGPT subscription/);
  });

  it('shows no Connections section while muster keeps no App', async () => {
    await renderPage();

    expect(
      screen.queryByRole('region', { name: 'Connections' }),
    ).not.toBeInTheDocument();
  });

  it('heads the page and shows the signed-in identity', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Profile and settings' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(
      screen.getByText('jane@example.com · from your company login'),
    ).toBeInTheDocument();
  });

  it('falls back to the email alone when there is no display name', async () => {
    await renderPage({ displayName: '', email: 'jane@example.com' });

    expect(await screen.findByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('from your company login')).toBeInTheDocument();
  });

  it('hands every configured environment to the toggles, with no cap', async () => {
    mockInstallations = Array.from({ length: 300 }, (_, index) => ({
      name: `inst-${index + 1}`,
    }));
    await renderPage();

    const section = screen.getByRole('region', { name: 'Environments' });
    expect(section).toHaveTextContent(
      'The environments this portal talks to. Turn one off and the portal shows nothing from it.',
    );
    expect(within(section).getAllByRole('listitem')).toHaveLength(300);
    expect(
      within(section).queryByRole('button', { name: /Show all/ }),
    ).toBeNull();
  });

  it('leaves the installations section out when none are configured', async () => {
    mockInstallations = [];
    await renderPage();

    expect(
      screen.queryByRole('region', { name: 'Environments' }),
    ).not.toBeInTheDocument();
  });

  it('signs out through the identity API', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('keeps an escape hatch to the classic portal settings, in a new tab', async () => {
    await renderPage();

    const link = screen.getByRole('link', {
      name: 'All portal settings (opens in a new tab)',
    });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('closes with the running release in the page footer, linked to its tag', async () => {
    await renderPage(undefined, { app: { releaseVersion: '0.220.3' } });

    const line = screen.getByText(/provided by Giant Swarm, release/);
    expect(line.textContent).toBe(
      'This is backstage (opens in a new tab) provided by Giant Swarm, release v0.220.3 (opens in a new tab)',
    );
    expect(line.closest('[class*="footer"]')).not.toBeNull();
    const tag = screen.getByRole('link', {
      name: 'v0.220.3 (opens in a new tab)',
    });
    expect(tag).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/backstage/releases/tag/v0.220.3',
    );
    expect(tag).toHaveAttribute('target', '_blank');
  });

  it('renders no footer at all when the version is unset', async () => {
    await renderPage();

    expect(
      screen.queryByText(/provided by Giant Swarm/),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[class*="footer"]')).toBeNull();
  });

  it('wraps a long address beside the avatar instead of widening the page (T22 C6)', async () => {
    const email =
      'jane.doe.with.a.very.long.address@platform-engineering.example.com';
    await renderPage({ displayName: 'Jane Doe', email });

    const identity = screen.getByTestId('profile-identity');
    expect(identity).toHaveTextContent(email);
    expect(identity).toHaveStyle({ minWidth: '0', overflowWrap: 'anywhere' });
  });
});
