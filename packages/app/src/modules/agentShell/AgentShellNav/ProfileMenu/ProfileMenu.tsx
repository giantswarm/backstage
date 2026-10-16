import { useLocation } from 'react-router-dom';
import {
  identityApiRef,
  routeResolutionApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import {
  Avatar,
  ButtonIcon,
  Flex,
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
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
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
  // The pinned rail's trigger, dressed as a rail item (RailLink's padding,
  // radius and hover) so it lines up left with the rest. Not a bui Button: its
  // content box centers whatever it holds (T73).
  railItem: {
    display: 'block',
    width: '100%',
    padding: 'var(--bui-space-2)',
    boxSizing: 'border-box',
    border: 0,
    borderRadius: 'var(--bui-radius-2)',
    background: 'transparent',
    color: 'var(--bui-fg-primary)',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    '&:hover, &[data-pressed], &[aria-expanded="true"]': {
      background: 'var(--agent-shell-rail-item-hover, var(--bui-bg-neutral-2))',
    },
    '&[data-focus-visible]': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: -2,
    },
  },
  railItemText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  identity: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 'var(--bui-space-3) var(--bui-space-3) var(--bui-space-1)',
    minWidth: 0,
  },
});

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
  return items.flatMap((item): MenuDestination[] => {
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
  // The profile page the menu's first item opens; left out while unbound.
  const profileRoute = useRouteRef(agentPlatformPlugin.routes.profile);
  const profileHref = profileRoute?.();
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
    ...(profileHref
      ? [
          <MenuItem
            key="settings"
            href={profileHref}
            iconStart={<Icon fontSize="small" />}
          >
            {item.title}
          </MenuItem>,
        ]
      : []),
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
  const isCurrent = [
    ...(profileHref ? [profileHref] : []),
    ...inShell.map(({ href }) => href),
  ].some(href => isUnder(pathname, href));

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
    // Who is signed in, with what the entry opens beneath — the subtitle is
    // what tells it apart from a name tag (T73). Without a name yet, the title
    // alone. The accessible name stays the title, which the subtitle shows.
    trigger = (
      <AriaButton aria-label={item.title} className={classes.railItem}>
        <Flex align="center" gap="2">
          {avatar}
          <span className={classes.railItemText}>
            <Text as="span" variant="body-medium" truncate>
              {name || item.title}
            </Text>
            {name && (
              <Text as="span" variant="body-small" color="secondary" truncate>
                {item.title}
              </Text>
            )}
          </span>
        </Flex>
      </AriaButton>
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
