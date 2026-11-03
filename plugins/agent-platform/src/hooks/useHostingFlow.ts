import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Model hosting's create flows (Serve model, Import, Pull, Add model backend,
 * Add GPU node pool) are pages of their own (`WizardFrame`), opened from a
 * view's header, empty state or row menu. These hooks carry the two things a
 * dialog over the list used to keep in memory across that navigation:
 *
 * - **where Cancel returns** — the view the flow was opened from, in the
 *   router state under {@link HOSTING_RETURN_KEY}; a deep link without one
 *   returns to the flow's own view;
 * - **what the list opens on** after the write — the pool's lifecycle panel,
 *   the served model's timeline — under a key of the flow's own, read once
 *   by the list and taken out of the history entry, so a reload or a Back
 *   does not replay it.
 */
export const HOSTING_RETURN_KEY = 'hostingReturnTo';

/** Opens a hosting flow, remembering the view it is opened from. */
export function useOpenHostingFlow(): (href: string) => void {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return useCallback(
    (href: string) =>
      navigate(href, {
        state: { [HOSTING_RETURN_KEY]: `${pathname}${search}` },
      }),
    [navigate, pathname, search],
  );
}

/**
 * Where a hosting flow's Close and Cancel lead: the view it was opened from,
 * else `fallback` (the flow's own view). Only an absolute path the app routes
 * is taken from the state.
 */
export function useHostingFlowReturn(fallback: string): string {
  const { state } = useLocation();
  const returnTo = (state as Record<string, unknown> | null)?.[
    HOSTING_RETURN_KEY
  ];
  return typeof returnTo === 'string' &&
    returnTo.startsWith('/') &&
    !returnTo.startsWith('//')
    ? returnTo
    : fallback;
}

/**
 * Reads the outcome a hosting flow handed to the view under `key`, exactly
 * once: held in local state for the life of the page and removed from the
 * history entry (the other keys stay). `parse` decides what counts as one.
 */
export function useHostingFlowOutcome<T>(
  key: string,
  parse: (value: unknown) => T | undefined,
): T | undefined {
  const location = useLocation();
  const navigate = useNavigate();
  const [outcome] = useState(() =>
    parse((location.state as Record<string, unknown> | null)?.[key]),
  );

  // Cleared in an effect rather than during render: navigating is a side
  // effect, and React may render twice before committing.
  const cleared = useRef(false);
  useEffect(() => {
    if (outcome === undefined || cleared.current) {
      return;
    }
    cleared.current = true;
    const { [key]: _consumed, ...rest } = (location.state ?? {}) as Record<
      string,
      unknown
    >;
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: Object.keys(rest).length ? rest : null },
    );
  }, [
    outcome,
    key,
    navigate,
    location.pathname,
    location.search,
    location.state,
  ]);

  return outcome;
}
