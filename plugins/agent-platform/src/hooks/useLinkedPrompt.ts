import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { linkedPromptOf, splitPromptFragment } from '../lib/newSessionLink';

export type LinkedPrompt = {
  /** The prompt the link brought (`#prompt=`); `undefined` for none. */
  prompt: string | undefined;
  /**
   * Changes when a link brings a prompt while the page is already open, so
   * the caller can start its composer over from it.
   */
  key: number;
};

/**
 * Reads `#prompt=` once and takes it out of the address bar with
 * `history.replaceState`, outside the router: a router navigation would change
 * the location and record a second page view. No history entry keeps the
 * prompt, so a reload restores the draft the person has written since, not the
 * link's prompt over it.
 */
export function useLinkedPrompt(): LinkedPrompt {
  const location = useLocation();
  const raw = splitPromptFragment(location.hash).prompt;
  const [linked, setLinked] = useState<LinkedPrompt>(() => ({
    prompt: linkedPromptOf(raw),
    key: 0,
  }));
  // The navigation already taken: the one at mount, so the effect below does
  // not take it a second time. The router keeps `#prompt=` in its location, so
  // a navigation is told apart by its key, not by the prompt.
  const taken = useRef(location.key);

  useEffect(() => {
    if (raw === null) return;
    if (location.key !== taken.current) {
      taken.current = location.key;
      // A blank prompt brings nothing: the composer is not started over.
      const prompt = linkedPromptOf(raw);
      if (prompt !== undefined) {
        setLinked(previous => ({ prompt, key: previous.key + 1 }));
      }
    }
    // Only `prompt` leaves: the path, the query, the rest of the fragment and
    // the router's history state stay.
    const { prompt: inBar, rest } = splitPromptFragment(window.location.hash);
    if (inBar === null) return;
    const { pathname, search } = window.location;
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${search}${rest}`,
    );
  }, [raw, location.key]);

  return linked;
}
