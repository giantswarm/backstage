import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls the window to the top whenever the pathname changes. react-router
 * keeps the scroll position across client-side navigation, so a link from far
 * down a list would otherwise open the next page mid-way. A change of the query
 * string alone (a filter, a drawer) keeps the position.
 *
 * Call it once, in the router of a section whose pages link to each other.
 */
export function useScrollToTopOnNavigation() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}
