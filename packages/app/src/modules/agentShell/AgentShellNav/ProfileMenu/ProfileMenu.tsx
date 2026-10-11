import { useLocation } from 'react-router-dom';
import {
  identityApiRef,
  routeResolutionApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import {
  Avatar,
  Button,
  ButtonIcon,
  Menu,
  MenuItem,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
  Text,
} from '@backstage/ui';
import {
  Button as AriaButton,
  Header,
  MenuSection as AriaMenuSection,
} from 'react-aria-components';
import { makeStyles } from '@material-ui/core/styles';
import ExitToAppIcon from '@material-ui/icons/ExitToApp';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import type { AgentShellNavItem } from '../../navItems';
import { type RailLayout, useBarItemStyles } from '../railLayout';
import { useProfile } from './useProfile';

/**
 * Where "Help and feedback" goes: the public docs, the same default the
 * homepage's Resources card links first. There is no per-installation help
 * link convention yet; when one appears this is the one place to read it.
 */
const HELP_URL = 'https://docs.giantswarm.io';

const useStyles = makeStyles({
  avatar: {
    color: 'var(--agent-shell-avatar-fg, var(--bui-fg-primary))',
    background: 'var(--agent-shell-avatar-bg, var(--bui-bg-neutral-2))',
    '& .bui-AvatarFallback': {
      boxShadow:
        'var(--agent-shell-avatar-ring, inset 0 0 0 1px var(--bui-border-2))',
    },
  },
  button: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  identity: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 'var(--bui-space-3) var(--bui-space-3) var(--bui-space-1)',
    minWidth: 0,
  },
});

/** The profile page the menu's first item opens. */
const PROFILE_PATH = '/agent-platform/profile';

type MenuDestination = {
  item: AgentShellNavItem;
  href: string;
};

/**
 * Where each relocated nav item goes; an item whose route is not bound is left
 * out, as the rail leaves it out.
 */
function useMenuDestinations(items: AgentShellNavItem[]): MenuDestination[] {
  const routeResolution = useApi(routeResolutionApiRef);
  return items.flatMap(item => {
    if ('path' in item) {
      return [{ item, href: item.path }];
    }
    if ('routeRef' in item) {
      try {
        const href = routeResolution.resolve(item.routeRef)?.();
        return href ? [{ item, href }] : [];
      } catch {
        return [];
      }
    }
    return [];
  });
}

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProfileMenu({
  item,
  layout,
  menuItems = [],
}: {
  item: AgentShellNavItem;
  layout: RailLayout;
  /**
   * Nav items that live in this menu rather than beside it — on a phone the
   * bottom bar holds five items, and Usage and the Platform Portal cross-link
   * move in here (T22 D1).
   */
  menuItems?: AgentShellNavItem[];
}) {
  const classes = useStyles();
  const barClasses = useBarItemStyles();
  const identityApi = useApi(identityApiRef);
  const { pathname } = useLocation();
  const destinations = useMenuDestinations(menuItems);
  const inShell = destinations.filter(({ item: entry }) => !entry.newTab);
  const leaving = destinations.filter(({ item: entry }) => entry.newTab);
  const profile = useProfile();
  const displayName = profile?.displayName?.trim() || undefined;
  const email = profile?.email?.trim() || undefined;
  const name = displayName ?? email ?? '';
  const Icon = item.icon;
  const avatar = (
    <Avatar
      src={profile?.picture ?? ''}
      name={name || item.title}
      size="small"
      purpose="decoration"
      className={classes.avatar}
    />
  );

  const settingsItems = [
    // The shell's own minimal profile page, same tab — not the classic
    // `/settings`, whose chrome the shell exists to stay out of. That page
    // keeps an explicit "All portal settings" escape hatch to the classic one.
    <MenuItem
      key="settings"
      href={PROFILE_PATH}
      iconStart={<Icon fontSize="small" />}
    >
      {item.title}
    </MenuItem>,
    ...inShell.map(({ item: entry, href }) => {
      const EntryIcon = entry.icon;
      return (
        <MenuItem
          key={entry.id}
          href={href}
          iconStart={<EntryIcon fontSize="small" />}
        >
          {entry.title}
        </MenuItem>
      );
    }),
  ];

  // The phone bar's Profile item is the current one while the person is on a
  // page only its menu leads to: the bar has no other item to mark.
  const isCurrent = [PROFILE_PATH, ...inShell.map(({ href }) => href)].some(
    href => isUnder(pathname, href),
  );

  let trigger;
  if (layout === 'bar') {
    trigger = (
      <AriaButton
        className={barClasses.item}
        aria-label={item.title}
        data-current={isCurrent ? 'true' : undefined}
      >
        {avatar}
        <span className={barClasses.label}>{item.barTitle ?? item.title}</span>
      </AriaButton>
    );
  } else if (layout === 'collapsed') {
    trigger = (
      <ButtonIcon variant="tertiary" icon={avatar} aria-label={item.title} />
    );
  } else {
    trigger = (
      <Button
        variant="tertiary"
        iconStart={avatar}
        aria-label={item.title}
        className={classes.button}
      >
        {name || item.title}
      </Button>
    );
  }

  return (
    <MenuTrigger>
      {trigger}
      <Menu placement={layout === 'bar' ? 'top end' : 'top start'}>
        {name ? (
          // Who is signed in heads the group rather than being an item: it is
          // not something to choose.
          <AriaMenuSection>
            <Header className={classes.identity}>
              {displayName && (
                <Text as="div" variant="body-small" weight="bold" truncate>
                  {displayName}
                </Text>
              )}
              {email && (
                <Text
                  as="div"
                  variant="body-small"
                  color={displayName ? 'secondary' : undefined}
                  truncate
                >
                  {email}
                </Text>
              )}
            </Header>
            {settingsItems}
          </AriaMenuSection>
        ) : (
          <MenuSection title="Signed in">{settingsItems}</MenuSection>
        )}
        <MenuSeparator />
        {/* The prototype groups help and sign-out below the settings group.
            The docs are another origin, so this opens a new tab rather than
            navigating the portal away mid-session. The Platform Portal
            cross-link joins them on a phone, for the same reason. */}
        {leaving.map(({ item: entry, href }) => {
          const EntryIcon = entry.icon;
          return (
            <MenuItem
              key={entry.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              iconStart={<EntryIcon fontSize="small" />}
            >
              {entry.title}
            </MenuItem>
          );
        })}
        <MenuItem
          href={HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          iconStart={<HelpOutlineIcon fontSize="small" />}
        >
          Help and feedback
        </MenuItem>
        <MenuItem
          iconStart={<ExitToAppIcon fontSize="small" />}
          onAction={() => {
            void identityApi.signOut();
          }}
        >
          Sign out
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}
