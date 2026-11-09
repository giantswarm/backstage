import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  linkedPromptOf,
  NEW_SESSION_PROMPT_PARAM,
} from '../lib/newSessionLink';

export type LinkedPrompt = {
  /** The prompt the link brought (`linkedPromptOf`); `undefined` for none. */
  prompt: string | undefined;
  /**
   * Changes when a link brings a prompt while the page is already open, so
   * the caller can start its composer over from it.
   */
  key: number;
};

/**
 * Reads `?prompt=` once and takes it out of the address (a replace, so no
 * history entry keeps it): a reload then restores the draft the person has
 * written since, not the link's prompt over it.
 */
export function useLinkedPrompt(): LinkedPrompt {
  const location = useLocation();
  const navigate = useNavigate();
  const raw = new URLSearchParams(location.search).get(
    NEW_SESSION_PROMPT_PARAM,
  );
  const [linked, setLinked] = useState<LinkedPrompt>(() => ({
    prompt: linkedPromptOf(raw),
    key: 0,
  }));
  // The value already taken: the one read at mount, so the effect below does
  // not take it a second time.
  const taken = useRef(raw);

  useEffect(() => {
    if (raw === null) {
      taken.current = null;
      return;
    }
    if (raw !== taken.current) {
      taken.current = raw;
      // A blank prompt brings nothing: the composer is not started over.
      const prompt = linkedPromptOf(raw);
      if (prompt !== undefined) {
        setLinked(previous => ({ prompt, key: previous.key + 1 }));
      }
    }
    // Only `prompt` leaves: the path, the other parameters, the fragment and
    // the router state stay.
    const search = new URLSearchParams(location.search);
    search.delete(NEW_SESSION_PROMPT_PARAM);
    const rest = search.toString();
    navigate(
      { ...location, search: rest ? `?${rest}` : '' },
      { replace: true, state: location.state },
    );
  }, [raw, location, navigate]);

  return linked;
}
