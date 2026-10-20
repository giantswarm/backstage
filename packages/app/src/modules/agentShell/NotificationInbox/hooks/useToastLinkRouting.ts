import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/** The link that opens the inbox's overlay, wherever the person is. */
export const NOTIFICATIONS_HASH = '#notifications';

/** The app's toasts, matched by their module class's stable prefix. */
const TOAST_LINKS = "[class*='Toast_container'] a[href]";

/**
 * Follows the links in the app's toasts inside the app.
 *
 * The upstream toast (`@backstage/plugin-app`) renders a link as a plain
 * `<a href>`, so "Open session" reloaded the whole portal: a new sign-in
 * round, the shell's reads started over, and the inbox's catch-up with them.
 * A plain click on a same-origin toast link is routed here instead, in the
 * capture phase so it is taken before the browser follows it, and a hash
 * link of `hashActions` (`#notifications` opens the overlay) acts where the
 * person is. Modified clicks (a new tab) and links elsewhere keep the
 * browser's behaviour.
 */
export function useToastLinkRouting(
  hashActions: Readonly<Record<string, () => void>>,
) {
  const navigate = useNavigate();
  const hashActionsRef = useRef(hashActions);
  hashActionsRef.current = hashActions;

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>(TOAST_LINKS)
          : null;
      if (!link || (link.target && link.target !== '_self')) {
        return;
      }
      const action = hashActionsRef.current[link.getAttribute('href') ?? ''];
      if (action) {
        event.preventDefault();
        action();
        return;
      }
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }
      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
}
