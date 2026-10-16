import {
  Button,
  ButtonIcon,
  Menu,
  MenuItem,
  MenuTrigger,
  Text,
  VisuallyHidden,
} from '@backstage/ui';
import { Link as AriaLink } from 'react-aria-components';
import { makeStyles } from '@material-ui/core/styles';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import VpnKeyOutlinedIcon from '@material-ui/icons/VpnKeyOutlined';
import { AgentAvatar } from '@giantswarm/backstage-plugin-agent-platform';
import {
  getRelativeDate,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';
import type { InboxRow } from '../types';

const useStyles = makeStyles({
  row: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
    borderRadius: 'var(--bui-radius-2)',
    '&:hover': {
      background: 'var(--agent-shell-rail-item-hover, var(--bui-bg-neutral-2))',
    },
  },
  unread: {
    background: 'var(--bui-bg-neutral-2)',
  },
  // The row's content, a link or (for a row that acts in place) not.
  content: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-3)',
    // 44px and up under a thumb: two lines of text and the padding.
    padding: 'var(--bui-space-2) var(--bui-space-1) var(--bui-space-2) 14px',
  },
  link: {
    color: 'var(--bui-fg-primary)',
    textDecoration: 'none',
    borderRadius: 'var(--bui-radius-2)',
    cursor: 'pointer',
    outline: 'none',
    '&[data-focus-visible]': {
      boxShadow: 'inset 0 0 0 2px var(--bui-ring)',
    },
  },
  unreadDot: {
    position: 'absolute',
    left: 4,
    top: '50%',
    width: 6,
    height: 6,
    marginTop: -3,
    borderRadius: '50%',
    background: 'var(--bui-fg-primary)',
  },
  avatar: {
    flex: '0 0 auto',
  },
  // In the Avatar's place, its size and shape.
  icon: {
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: '20%',
    background: 'var(--bui-warning-bg-subdued)',
    color: 'var(--bui-warning-fg-subdued)',
    '& svg': {
      fontSize: 16,
    },
  },
  text: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  chip: {
    flex: '0 0 auto',
    '& .bui-Text': {
      fontSize: 'var(--bui-font-size-2)',
    },
  },
  menu: {
    flex: '0 0 auto',
    marginRight: 'var(--bui-space-1)',
  },
  action: {
    flex: '0 0 auto',
    marginRight: 'var(--bui-space-2)',
  },
});

const ICONS = {
  signIn: VpnKeyOutlinedIcon,
};

/**
 * One row of the Notification inbox: the agent's Avatar, what happened, the
 * session's name, how long ago and a state chip, with its own ⋯ menu.
 * Clicking it opens what it is about; `onOpen` marks it read. A row with an
 * `action` (the MCP sign-in row's Sign in) is not a link: its button calls
 * `onOpen`, which opens it in place.
 */
export function NotificationRow({
  row,
  now,
  onOpen,
}: {
  row: InboxRow;
  /** The time ages are told against, shared by the list's rows. */
  now: number;
  onOpen: () => void;
}) {
  const classes = useStyles();
  const meta = [
    row.context,
    row.at === undefined
      ? undefined
      : getRelativeDate(new Date(row.at), new Date(now)),
    row.detail,
  ].filter(Boolean);

  const Icon = row.icon ? ICONS[row.icon] : undefined;
  const content = (
    <>
      {row.avatar && (
        <AgentAvatar
          size="small"
          purpose="decoration"
          name={row.avatar.name}
          src={row.avatar.src ?? ''}
          className={classes.avatar}
        />
      )}
      {Icon && (
        <span aria-hidden="true" className={classes.icon}>
          <Icon />
        </span>
      )}
      <span className={classes.text}>
        <Text
          as="span"
          variant="body-small"
          weight={row.unread ? 'bold' : 'regular'}
        >
          {row.action && row.unread && (
            <VisuallyHidden>Unread: </VisuallyHidden>
          )}
          {row.title}
        </Text>
        {meta.length > 0 && (
          <Text as="span" variant="body-x-small" color="secondary">
            {meta.join(' · ')}
          </Text>
        )}
      </span>
      {row.state && (
        <span className={classes.chip}>
          <StatusDot tone={row.state.tone} label={row.state.label} size={6} />
        </span>
      )}
    </>
  );
  const { action } = row;

  return (
    <li
      className={row.unread ? `${classes.row} ${classes.unread}` : classes.row}
      data-unread={row.unread ? 'true' : undefined}
    >
      {row.unread && <span aria-hidden="true" className={classes.unreadDot} />}
      {action ? (
        <>
          <span className={classes.content}>{content}</span>
          <Button
            variant="primary"
            size="small"
            className={classes.action}
            aria-label={action.accessibleLabel}
            onPress={onOpen}
          >
            {action.label}
          </Button>
        </>
      ) : (
        <AriaLink
          href={row.href}
          onPress={onOpen}
          className={`${classes.content} ${classes.link}`}
          aria-label={row.unread ? `Unread: ${row.title}` : undefined}
        >
          {content}
        </AriaLink>
      )}
      {row.actions && row.actions.length > 0 && (
        <span className={classes.menu}>
          <MenuTrigger>
            <ButtonIcon
              variant="tertiary"
              size="small"
              icon={<MoreVertIcon fontSize="small" />}
              aria-label={`More actions for ${row.title}`}
            />
            <Menu placement="bottom end">
              {row.actions.map(item => (
                <MenuItem key={item.id} onAction={item.onAction}>
                  {item.label}
                </MenuItem>
              ))}
            </Menu>
          </MenuTrigger>
        </span>
      )}
    </li>
  );
}
