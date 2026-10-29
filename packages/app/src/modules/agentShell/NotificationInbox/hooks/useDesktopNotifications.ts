import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Where this browser keeps the person's "Desktop notifications" choice. Per
 * browser, not roaming with the person: the browser's permission it depends
 * on is per browser too.
 */
export const DESKTOP_NOTIFICATIONS_STORAGE_KEY =
  'agentPlatform.desktopNotifications';

export type DesktopPermission = NotificationPermission | 'unsupported';

function readPermission(): DesktopPermission {
  return typeof window !== 'undefined' && 'Notification' in window
    ? window.Notification.permission
    : 'unsupported';
}

function readChoice(): boolean {
  try {
    return (
      window.localStorage.getItem(DESKTOP_NOTIFICATIONS_STORAGE_KEY) === 'on'
    );
  } catch {
    return false;
  }
}

function writeChoice(on: boolean) {
  try {
    if (on) {
      window.localStorage.setItem(DESKTOP_NOTIFICATIONS_STORAGE_KEY, 'on');
    } else {
      window.localStorage.removeItem(DESKTOP_NOTIFICATIONS_STORAGE_KEY);
    }
  } catch {
    // Storage blocked (a private window): the choice lasts this page only.
  }
}

export type DesktopNotifications = {
  permission: DesktopPermission;
  /** Switched on here and allowed by the browser. */
  enabled: boolean;
  /**
   * Switches desktop notifications on or off. Switching on asks the browser
   * for permission when it has not been asked yet: the prompt follows this
   * call, which follows the person's click, and nothing else.
   */
  setEnabled: (on: boolean) => Promise<void>;
};

/**
 * The person's opt-in to desktop notifications in this browser, and the
 * browser's permission for them. Tabs of the same browser follow each other's
 * choice.
 */
export function useDesktopNotifications(): DesktopNotifications {
  const [choice, setChoice] = useState(readChoice);
  const [permission, setPermission] = useState(readPermission);

  useEffect(() => {
    // Another tab switched, or the person changed the site's permission in
    // the browser while this tab was in the background.
    const sync = () => {
      setChoice(readChoice());
      setPermission(readPermission());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DESKTOP_NOTIFICATIONS_STORAGE_KEY) {
        sync();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    if (!on) {
      writeChoice(false);
      setChoice(false);
      return;
    }
    let next = readPermission();
    if (next === 'default') {
      next = await window.Notification.requestPermission();
    }
    setPermission(next);
    const granted = next === 'granted';
    writeChoice(granted);
    setChoice(granted);
  }, []);

  // Stable while nothing changes: the inbox's context carries it.
  return useMemo(
    () => ({
      permission,
      enabled: choice && permission === 'granted',
      setEnabled,
    }),
    [choice, permission, setEnabled],
  );
}

/**
 * Raises one desktop notification. `tag` is the row's identity, so the
 * browser shows one per event however many tabs raise it (while the first is
 * still on screen). Silent, and never carrying text from the conversation:
 * the caller passes the agent, the session's name and the event only.
 */
export function showDesktopNotification({
  title,
  body,
  tag,
  onClick,
}: {
  title: string;
  body?: string;
  tag: string;
  onClick: () => void;
}) {
  if (readPermission() !== 'granted') {
    return;
  }
  try {
    const notification = new window.Notification(title, {
      body,
      tag,
      silent: true,
    });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    // Some mobile browsers only raise notifications from a service worker,
    // and throw here; the bell and the tab title still say it.
  }
}
