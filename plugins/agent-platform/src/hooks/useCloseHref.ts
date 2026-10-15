import { useLocation } from 'react-router-dom';

import { useNewSessionHref } from './useNewSessionHref';

/**
 * Where a page's Close or Cancel leads: the first of `targets` that resolves,
 * else the shell's home as the app binds it (`newSession`), else the page
 * itself. A frame that needs an href so never points at a path written by
 * hand, and the fallbacks only matter where the app binds nothing.
 */
export function useCloseHref(...targets: (string | undefined)[]): string {
  const newSessionHref = useNewSessionHref();
  const { pathname } = useLocation();
  return (
    targets.find(target => target !== undefined) ??
    newSessionHref?.() ??
    pathname
  );
}
