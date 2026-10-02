import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Scrolls the window to the top whenever a link or a redirect changes the
 * pathname. react-router keeps the scroll position across client-side
 * navigation, so a link from far down a list would otherwise open the next
 * page mid-way. A change of the query string alone (a filter, a drawer) keeps
 * the position, and so does Back or Forward: there the browser restores where
 * the person was.
 *
 * Call it once, in the router of a section whose pages link to each other.
 */
export function useScrollToTopOnNavigation() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    }
    // The pathname alone decides; the type is read for the change it caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}
