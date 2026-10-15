import { useState } from 'react';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Button, Flex, Switch, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';
import { NotificationRow } from '../NotificationRow';
import { useNotificationInbox } from '../NotificationInboxProvider';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    maxHeight: 'inherit',
  },
  header: {
    padding: 'var(--bui-space-1) var(--bui-space-1) var(--bui-space-2)',
    borderBottom: '1px solid var(--bui-border-1)',
    // The tertiary button keeps the header's height when it is not there.
    minHeight: 32,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 'var(--bui-space-2) 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflowY: 'auto',
    minHeight: 0,
    flex: '1 1 auto',
  },
  state: {
    padding: 'var(--bui-space-4) var(--bui-space-1)',
  },
  footer: {
    padding: 'var(--bui-space-3) var(--bui-space-1) var(--bui-space-1)',
    borderTop: '1px solid var(--bui-border-1)',
  },
});

/**
 * The desktop-notifications switch: the browser's permission prompt follows
 * a click on it, and nothing else. Left out where the browser has no
 * notifications.
 */
function DesktopNotificationsSwitch() {
  const inbox = useNotificationInbox();
  if (!inbox || inbox.desktop.permission === 'unsupported') {
    return null;
  }
  const { permission, enabled, setEnabled } = inbox.desktop;
  return (
    <Flex direction="column" gap="1">
      <Switch
        label="Desktop notifications"
        isSelected={enabled}
        isDisabled={permission === 'denied'}
        onChange={on => {
          setEnabled(on).catch(() => {});
        }}
      />
      {permission === 'denied' && (
        <Text as="p" variant="body-x-small" color="secondary">
          This browser blocks notifications from the portal. Allow them in its
          site settings to switch them on.
        </Text>
      )}
    </Flex>
  );
}

/**
 * The overlay's content, the same in the rail's popover and the phone's
 * sheet: "Mark all read", the rows newest first, and the desktop-
 * notifications switch. `onNavigate` closes the overlay when a row opens its
 * page.
 */
export function NotificationList({
  onNavigate,
  heading = true,
}: {
  onNavigate: () => void;
  /** The phone's sheet titles itself; the popover needs the heading here. */
  heading?: boolean;
}) {
  const classes = useStyles();
  const inbox = useNotificationInbox();
  const toastApi = useApi(toastApiRef);
  const [marking, setMarking] = useState(false);
  if (!inbox) {
    return null;
  }
  const { rows, ready, unreadCount, markRead, markAllRead } = inbox;

  const onMarkAllRead = () => {
    setMarking(true);
    markAllRead()
      .catch(() =>
        toastApi.post({
          title: 'Could not mark the notifications read',
          status: 'danger',
          timeout: 8000,
        }),
      )
      .finally(() => setMarking(false));
  };

  let body;
  if (rows.length > 0) {
    body = (
      <ul className={classes.list} aria-label="Notifications">
        {rows.map(row => (
          <NotificationRow
            key={row.id}
            row={row}
            onOpen={() => {
              markRead(row);
              onNavigate();
            }}
          />
        ))}
      </ul>
    );
  } else if (!ready) {
    body = (
      <div className={classes.state}>
        <LoadingIndicator label="Reading notifications…" />
      </div>
    );
  } else {
    body = (
      <Text as="p" color="secondary" className={classes.state}>
        Nothing needs you right now.
      </Text>
    );
  }

  return (
    <div className={classes.root}>
      <Flex
        align="center"
        justify={heading ? 'between' : 'end'}
        gap="2"
        className={classes.header}
      >
        {heading && (
          <Text as="h2" variant="title-x-small">
            Notifications
          </Text>
        )}
        {unreadCount > 0 && (
          <Button
            variant="tertiary"
            size="small"
            onPress={onMarkAllRead}
            isDisabled={marking}
          >
            Mark all read
          </Button>
        )}
      </Flex>
      {body}
      {inbox.desktop.permission !== 'unsupported' && (
        <div className={classes.footer}>
          <DesktopNotificationsSwitch />
        </div>
      )}
    </div>
  );
}
