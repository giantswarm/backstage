import { identityApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsIcon from '@material-ui/icons/Settings';
import type { AgentShellNavItem } from '../../navItems';
import { ProfileMenu } from './ProfileMenu';

const item: AgentShellNavItem = {
  id: 'profile',
  title: 'Profile and settings',
  icon: SettingsIcon,
  menu: 'profile',
  position: 'bottom',
};

const signOut = jest.fn().mockResolvedValue(undefined);

async function renderMenu(
  profile: { displayName?: string; email?: string } = {
    displayName: 'Jane Doe',
    email: 'jane@example.com',
  },
) {
  await renderInTestApp(<ProfileMenu item={item} layout="expanded" />, {
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
  await userEvent.click(
    screen.getByRole('button', { name: 'Profile and settings' }),
  );
  return screen.findByRole('menu');
}

beforeEach(() => {
  signOut.mockClear();
});

describe('ProfileMenu', () => {
  it('carries the profile, help and sign-out items — and no feature flags', async () => {
    const menu = await renderMenu();

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(menuItem => menuItem.textContent),
    ).toEqual(['Profile and settings', 'Help and feedback', 'Sign out']);
    expect(within(menu).queryByText('Feature flags')).not.toBeInTheDocument();
  });

  it('links Profile and settings to the in-shell profile page, same tab', async () => {
    const menu = await renderMenu();

    const settings = within(menu).getByRole('menuitem', {
      name: 'Profile and settings',
    });
    expect(settings).toHaveAttribute('href', '/agent-platform/profile');
    expect(settings).not.toHaveAttribute('target');
  });

  it('keeps Help and feedback pointing at the docs, in a new tab', async () => {
    const menu = await renderMenu();

    const help = within(menu).getByRole('menuitem', {
      name: 'Help and feedback',
    });
    expect(help).toHaveAttribute('href', 'https://docs.giantswarm.io');
    expect(help).toHaveAttribute('target', '_blank');
  });

  it('signs out through the identity API', async () => {
    const menu = await renderMenu();

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Sign out' }),
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
