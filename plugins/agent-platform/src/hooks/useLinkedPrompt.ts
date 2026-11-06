import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(NEW_SESSION_PROMPT_PARAM);
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
      setLinked(previous => ({
        prompt: linkedPromptOf(raw),
        key: previous.key + 1,
      }));
    }
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete(NEW_SESSION_PROMPT_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [raw, setSearchParams]);

  return linked;
}
