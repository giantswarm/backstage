import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

/** The way somewhere else, held until the person agrees to leave. */
type HeldLeave = () => void;

/**
 * Whether a click is a plain one on a link to another address of this app:
 * the kind react-router's `Link` turns into client-side navigation, and
 * skips once the click is `defaultPrevented`. A modified click or one on a
 * link to a new tab leaves the page where it is, so it passes.
 */
function leavingHref(event: MouseEvent): string | undefined {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return undefined;
  }
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (
    !(anchor instanceof HTMLAnchorElement) ||
    (anchor.target && anchor.target !== '_self') ||
    anchor.hasAttribute('download')
  ) {
    return undefined;
  }
  const url = new URL(anchor.href, window.location.href);
  if (
    url.origin !== window.location.origin ||
    url.pathname === window.location.pathname
  ) {
    return undefined;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** What leaving says it loses, by what the page runs. */
const LEAVE_COPY: Record<'tool' | 'workflow', { title: string; body: string }> =
  {
    tool: {
      title: 'Leave while the tool runs?',
      body: 'muster finishes the call after you leave, but the result it returns shows only here, so leaving loses it.',
    },
    workflow: {
      title: 'Leave while the workflow runs?',
      body: 'muster keeps running it after you leave, and the Usage tab shows how it ended. The result it returns shows only here, so leaving loses it.',
    },
  };

/**
 * Asks before the person leaves a tool's or a workflow's Run it tab while a
 * run is in flight, because the result shows only there. The app's router is a
 * `BrowserRouter`, with no navigation blocker, so this holds what can be
 * held without one:
 *
 * - the page's tabs, through `ShellPage`'s `onTabNavigate` (they navigate on
 *   press through react-aria's router, not on click);
 * - a plain click on any link to another address — breadcrumbs, the back
 *   arrow, the rail and nav, links in the page — caught in the capture phase
 *   before react-router's `Link` handles it;
 * - a reload or a closed tab, through the browser's own prompt.
 *
 * The browser's Back, the command palette and navigation started by code (a
 * header action's hand-off) are not held: without a data router there is no
 * way to stop them.
 */
export function useRunLeaveGuard(
  active: boolean,
  subject: 'tool' | 'workflow',
): {
  onTabNavigate: (href: string, navigate: () => void) => void;
  dialog: ReactNode;
} {
  const navigate = useNavigate();
  const [held, setHeld] = useState<HeldLeave | undefined>();

  // A run that ends while the dialog asks leaves nothing to warn about, and
  // its result has just landed: the person stays to see it.
  useEffect(() => {
    if (!active) {
      setHeld(undefined);
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onClick = (event: MouseEvent) => {
      const href = leavingHref(event);
      if (href === undefined) {
        return;
      }
      event.preventDefault();
      setHeld(() => () => navigate(href));
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Still required by some browsers to show the prompt.
      event.returnValue = '';
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [active, navigate]);

  const onTabNavigate = useCallback(
    (_href: string, go: () => void) => {
      if (active) {
        setHeld(() => go);
      } else {
        go();
      }
    },
    [active],
  );

  const dialog = (
    <ConfirmDialog
      isOpen={held !== undefined}
      onOpenChange={isOpen => {
        if (!isOpen) {
          setHeld(undefined);
        }
      }}
      title={LEAVE_COPY[subject].title}
      confirmLabel="Leave"
      cancelLabel="Stay"
      onConfirm={() => {
        const go = held;
        setHeld(undefined);
        go?.();
      }}
    >
      <Text as="p" variant="body-medium">
        {LEAVE_COPY[subject].body}
      </Text>
    </ConfirmDialog>
  );

  return { onTabNavigate, dialog };
}
