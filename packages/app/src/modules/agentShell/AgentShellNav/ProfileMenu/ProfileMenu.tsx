import { identityApiRef, useApi } from '@backstage/frontend-plugin-api';
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
import { Header, MenuSection as AriaMenuSection } from 'react-aria-components';
import { makeStyles } from '@material-ui/core/styles';
import ExitToAppIcon from '@material-ui/icons/ExitToApp';
import FlagIcon from '@material-ui/icons/Flag';
import type { AgentShellNavItem } from '../../navItems';
import { useProfile } from './useProfile';

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

export function ProfileMenu({
  item,
  compact,
}: {
  item: AgentShellNavItem;
  compact: boolean;
}) {
  const classes = useStyles();
  const identityApi = useApi(identityApiRef);
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
    <MenuItem
      key="settings"
      href="/settings"
      iconStart={<Icon fontSize="small" />}
    >
      {item.title}
    </MenuItem>,
    <MenuItem
      key="feature-flags"
      href="/settings/feature-flags"
      iconStart={<FlagIcon fontSize="small" />}
    >
      Feature flags
    </MenuItem>,
  ];

  return (
    <MenuTrigger>
      {compact ? (
        <ButtonIcon variant="tertiary" icon={avatar} aria-label={item.title} />
      ) : (
        <Button
          variant="tertiary"
          iconStart={avatar}
          aria-label={item.title}
          className={classes.button}
        >
          {name || item.title}
        </Button>
      )}
      <Menu placement="top start">
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
