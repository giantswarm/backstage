import { ButtonIcon, DialogTrigger, Popover } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import NotificationsNoneIcon from '@material-ui/icons/NotificationsNone';
import { NotificationList } from '../NotificationList';
import { useNotificationInbox } from '../NotificationInboxProvider';
import { UnreadBadge, withUnreadCount } from '../UnreadBadge';

/** The overlay's width beside the rail, less on a narrow window. */
const OVERLAY_WIDTH = 400;

const useStyles = makeStyles({
  bell: {
    position: 'relative',
    display: 'inline-flex',
    flex: '0 0 auto',
  },
  content: {
    width: `min(${OVERLAY_WIDTH}px, calc(100vw - 32px))`,
    // The popover scrolls as a whole otherwise: keep the header and the
    // switch in place and scroll the rows.
    maxHeight: 'min(560px, calc(100dvh - 48px))',
    display: 'flex',
    flexDirection: 'column',
  },
});

/**
 * The bell on the rail's Profile row, expanded or collapsed, with the unread
 * badge. It opens the inbox's overlay anchored beside it, over the page, so
 * the person keeps their place. Renders nothing without an inbox.
 */
export function NotificationBell() {
  const classes = useStyles();
  const inbox = useNotificationInbox();
  if (!inbox) {
    return null;
  }
  const { unreadCount, isOpen, setOpen } = inbox;
  return (
    <span className={classes.bell}>
      <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
        <ButtonIcon
          variant="tertiary"
          size="small"
          icon={<NotificationsNoneIcon fontSize="small" />}
          aria-label={withUnreadCount('Notifications', unreadCount)}
        />
        {/* bui's Popover does not pass a name on, so the content is the
            named dialog; react-aria then leaves the popover itself unroled. */}
        <Popover placement="right bottom" hideArrow>
          <div
            className={classes.content}
            role="dialog"
            aria-label="Notifications"
          >
            <NotificationList onNavigate={() => setOpen(false)} />
          </div>
        </Popover>
      </DialogTrigger>
      <UnreadBadge count={unreadCount} />
    </span>
  );
}
