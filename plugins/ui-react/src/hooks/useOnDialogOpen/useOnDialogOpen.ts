import { useLayoutEffect, useRef } from 'react';

/**
 * Runs `onOpen` each time a controlled dialog goes from closed to open, before
 * the browser paints it.
 *
 * Resetting a dialog's state here instead of in its close handler matters for
 * a bui `Dialog`: it keeps rendering during its exit animation, and state
 * cleared on close shows as a flash of the wrong content while it fades out.
 * Running before paint keeps the previous session's content from flashing on
 * reopen. Only the transition counts, so live data that re-renders an open
 * dialog does not reset what the user is doing in it.
 */
export function useOnDialogOpen(isOpen: boolean, onOpen: () => void) {
  const latestOnOpen = useRef(onOpen);
  const wasOpen = useRef(false);

  useLayoutEffect(() => {
    latestOnOpen.current = onOpen;
  });

  useLayoutEffect(() => {
    if (isOpen && !wasOpen.current) {
      latestOnOpen.current();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);
}
