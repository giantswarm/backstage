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
} from '@backstage/ui';
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
  // A line of information, not an action: read at full contrast, not dimmed
  // as a disabled action would be.
  email: {
    '&&': {
      opacity: 1,
      cursor: 'default',
      color: 'var(--bui-fg-secondary)',
    },
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
  const name = profile?.displayName || profile?.email || '';
  const email = profile?.displayName ? profile.email : undefined;
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
        <MenuSection title={name || 'Signed in'}>
          {email ? (
            <MenuItem id="email" isDisabled className={classes.email}>
              {email}
            </MenuItem>
          ) : null}
          <MenuItem href="/settings" iconStart={<Icon fontSize="small" />}>
            {item.title}
          </MenuItem>
          <MenuItem
            href="/settings/feature-flags"
            iconStart={<FlagIcon fontSize="small" />}
          >
            Feature flags
          </MenuItem>
        </MenuSection>
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
