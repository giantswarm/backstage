import { ReactElement } from 'react';
import {
  Button,
  ButtonIcon,
  Flex,
  Menu,
  MenuItem,
  MenuTrigger,
} from '@backstage/ui';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { MENU_WIDTH } from '@giantswarm/backstage-plugin-ui-react';

export interface ServerMenuItem {
  id: string;
  label: string;
  onAction: () => void;
  icon?: ReactElement;
  danger?: boolean;
}

export interface ServerHeaderActionsProps {
  /** The one thing blocking this person, first and primary until done. */
  signIn?: { onPress: () => void; isPending: boolean };
  /** Edit, Edit as JSON or Edit/Remove. */
  primary?: { label: string; onPress: () => void; icon?: ReactElement };
  menuItems: ServerMenuItem[];
}

/**
 * The server page's header actions: one primary button (Sign in ahead of it
 * while a sign-in is needed) and an overflow menu -- the agent detail page's
 * shape. The header renders outside muster's QueryClientProvider, so this only
 * asks the page to act: every mutation, sign-in state and dialog lives in the
 * page body. What cannot be offered is left out, and the page says why.
 */
export function ServerHeaderActions({
  signIn,
  primary,
  menuItems,
}: ServerHeaderActionsProps) {
  if (!signIn && !primary && menuItems.length === 0) {
    return null;
  }
  return (
    <Flex align="center" gap="2">
      {signIn && (
        <Button
          variant="primary"
          isPending={signIn.isPending}
          onPress={signIn.onPress}
        >
          Sign in
        </Button>
      )}
      {primary && (
        <Button
          variant={signIn ? 'secondary' : 'primary'}
          iconStart={primary.icon}
          onPress={primary.onPress}
        >
          {primary.label}
        </Button>
      )}
      {menuItems.length > 0 && (
        <MenuTrigger>
          <ButtonIcon
            icon={<MoreVertIcon />}
            aria-label="Server actions"
            variant="tertiary"
          />
          <Menu maxWidth={MENU_WIDTH}>
            {menuItems.map(item => (
              <MenuItem
                key={item.id}
                id={item.id}
                iconStart={item.icon}
                color={item.danger ? 'danger' : undefined}
                onAction={item.onAction}
              >
                {item.label}
              </MenuItem>
            ))}
          </Menu>
        </MenuTrigger>
      )}
    </Flex>
  );
}
