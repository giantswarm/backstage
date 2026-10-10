import { identityApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InstallationConfig } from '@giantswarm/backstage-plugin-gs';
import { ProfilePage } from './ProfilePage';

let mockInstallations: Pick<InstallationConfig, 'name' | 'pipeline'>[] = [];
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: false,
  }),
}));

const signOut = jest.fn().mockResolvedValue(undefined);

async function renderPage(
  profile: { displayName?: string; email?: string } = {
    displayName: 'Jane Doe',
    email: 'jane@example.com',
  },
) {
  await renderInTestApp(<ProfilePage />, {
    apis: [
      [
        identityApiRef,
        mockApis.identity.mock({
          getProfileInfo: async () => profile,
          signOut,
        }),
      ],
    ],
  });
  // Wait for the identity to land, so the profile's state update stays
  // inside the test instead of warning after it.
  await screen.findByText(
    profile.displayName?.trim() || profile.email || 'Signed in',
  );
}

beforeEach(() => {
  signOut.mockClear();
  mockInstallations = [{ name: 'gazelle', pipeline: 'testing' }];
});

describe('ProfilePage', () => {
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

  it('lists the installations the portal talks to', async () => {
    mockInstallations = [{ name: 'gazelle' }, { name: 'gorilla' }];
    await renderPage();

    const section = screen.getByRole('region', { name: 'Environments' });
    expect(
      within(section)
        .getAllByTestId('installation-chip')
        .map(chip => chip.textContent),
    ).toEqual(['gazelle', 'gorilla']);
  });

  it('shows a short fleet whole, with no reveal control', async () => {
    mockInstallations = [
      { name: 'gazelle' },
      { name: 'gorilla' },
      { name: 'golem' },
    ];
    await renderPage();

    const section = screen.getByRole('region', { name: 'Environments' });
    expect(within(section).getAllByTestId('installation-chip')).toHaveLength(3);
    expect(within(section).queryByRole('button')).toBeNull();
    expect(within(section).queryByRole('searchbox')).toBeNull();
  });

  it('shows the first 20 badges of a large fleet and reveals the rest in one click', async () => {
    mockInstallations = Array.from({ length: 300 }, (_, index) => ({
      name: `inst-${index + 1}`,
    }));
    await renderPage();

    const section = screen.getByRole('region', { name: 'Environments' });
    expect(within(section).getAllByTestId('installation-chip')).toHaveLength(
      20,
    );

    await userEvent.click(
      within(section).getByRole('button', {
        name: 'Show all 300 environments',
      }),
    );
    expect(within(section).getAllByTestId('installation-chip')).toHaveLength(
      300,
    );
    expect(
      within(section).getByRole('button', { name: 'Show fewer' }),
    ).toBeInTheDocument();
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

    const link = screen.getByRole('link', { name: 'All portal settings ↗' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
