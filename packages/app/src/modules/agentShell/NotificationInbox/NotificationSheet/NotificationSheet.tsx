import { Dialog, DialogHeader } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { PHONE_FULL_SCREEN_DIALOG } from '@giantswarm/backstage-plugin-agent-platform';
import { NotificationList } from '../NotificationList';
import { useNotificationInbox } from '../NotificationInboxProvider';

const useStyles = makeStyles({
  // The whole width of the phone, like the shell's other phone dialogs.
  dialog: PHONE_FULL_SCREEN_DIALOG,
  body: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
    maxHeight: 'calc(100dvh - 64px)',
    padding: '0 var(--bui-space-3) var(--bui-space-3)',
    boxSizing: 'border-box',
  },
});

/**
 * The inbox's overlay on a phone: a full-width sheet the Profile menu's
 * "Notifications" entry opens. Renders nothing without an inbox.
 */
export function NotificationSheet() {
  const classes = useStyles();
  const inbox = useNotificationInbox();
  if (!inbox?.isOpen) {
    return null;
  }
  const { setOpen } = inbox;
  return (
    <Dialog isOpen onOpenChange={setOpen} className={classes.dialog}>
      <DialogHeader>Notifications</DialogHeader>
      <div className={classes.body}>
        <NotificationList heading={false} onNavigate={() => setOpen(false)} />
      </div>
    </Dialog>
  );
}
