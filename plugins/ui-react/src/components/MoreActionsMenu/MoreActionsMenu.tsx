import { ButtonIcon, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { MENU_WIDTH } from '../../utils/menuWidth';

/** One entry of a page header's ⋮ menu: a press, or a link. */
export type MoreActionsMenuItem = {
  id: string;
  label: string;
  onAction?: () => void;
  href?: string;
  /** Opens `href` in a new tab, for a link that leaves the portal. */
  newTab?: boolean;
  isDisabled?: boolean;
  /** The destructive treatment, for a removal. */
  danger?: boolean;
};

export type MoreActionsMenuProps = {
  items: MoreActionsMenuItem[];
};

/**
 * A page header's "More actions" ⋮ menu (`ShellPage`'s `menu`): the
 * `MoreVert` button and a bui `Menu` at `MENU_WIDTH`. Renders nothing for an
 * empty list, since a menu item cannot say why it is missing; a page that
 * still wants the button shows it disabled through `DisabledAction`.
 */
export function MoreActionsMenu({ items }: MoreActionsMenuProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <MenuTrigger>
      <ButtonIcon
        icon={<MoreVertIcon />}
        aria-label="More actions"
        variant="tertiary"
      />
      <Menu maxWidth={MENU_WIDTH}>
        {items.map(item => (
          <MenuItem
            key={item.id}
            id={item.id}
            href={item.href}
            target={item.href && item.newTab ? '_blank' : undefined}
            rel={item.href && item.newTab ? 'noopener noreferrer' : undefined}
            onAction={item.onAction}
            isDisabled={item.isDisabled}
            color={item.danger ? 'danger' : undefined}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
