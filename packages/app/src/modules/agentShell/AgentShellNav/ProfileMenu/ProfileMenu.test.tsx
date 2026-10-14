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

  describe('the pinned rail trigger (T73)', () => {
    async function renderTrigger(profile: {
      displayName?: string;
      email?: string;
    }) {
      await renderInTestApp(<ProfileMenu item={item} layout="expanded" />, {
        apis: [
          [
            identityApiRef,
            mockApis.identity.mock({ getProfileInfo: async () => profile }),
          ],
        ],
      });
      return screen.getByRole('button', { name: 'Profile and settings' });
    }

    it('shows the name with "Profile and settings" beneath it', async () => {
      const trigger = await renderTrigger({
        displayName: 'Jane Doe',
        email: 'jane@example.com',
      });

      await within(trigger).findByText('Jane Doe');
      expect(
        within(trigger).getByText('Profile and settings'),
      ).toBeInTheDocument();
    });

    it('lines up left like the other rail items, not centered as a bui Button', async () => {
      const trigger = await renderTrigger({ displayName: 'Jane Doe' });
      await within(trigger).findByText('Jane Doe');

      // bui's Button centers its content box whatever the root says.
      expect(trigger.className).not.toMatch(/bui-Button/);
      expect(trigger.querySelector('[class*="ButtonContent"]')).toBeNull();

      // jsdom's computed style keeps its own button default, so read the rule.
      const [triggerClass] = trigger.className.split(' ');
      const css = Array.from(document.querySelectorAll('style'))
        .map(style => style.textContent ?? '')
        .join('\n');
      const rule = css.match(new RegExp(`\\.${triggerClass} \\{([^}]*)\\}`));
      expect(rule?.[1]).toMatch(/text-align: left;/);
      expect(rule?.[1]).toMatch(/width: 100%;/);
      expect(rule?.[1]).not.toMatch(/justify-content: center/);
    });

    it('shows the title once while there is no name to show', async () => {
      const trigger = await renderTrigger({});

      expect(
        await within(trigger).findAllByText('Profile and settings'),
      ).toHaveLength(1);
    });
  });

  it('signs out through the identity API', async () => {
    const menu = await renderMenu();

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Sign out' }),
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
