import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ComposerImage } from '../lib/messageImages';

/**
 * The first message of a session that was just created, carried from whichever
 * composer created it to the session detail page that has to send it.
 *
 * The agent travels with the prompt on purpose. The detail page can resolve a
 * session's agent on its own, but only after the session read has landed *and*
 * joined against the fleet-wide `Agent` list — two renders later at best. Carrying
 * it means the send can be dispatched on the first render, which is what makes the
 * prompt appear immediately rather than after a beat of empty conversation.
 */
export type NewSessionHandoff = {
  text: string;
  agentNamespace: string;
  agentName: string;
  /**
   * The portal wrote `text`, not the person: a meta-agent hand-off
   * (`useMetaAgentHandoff`). The session page captions that first message so
   * it does not read as the person's own words (UX review M20).
   */
  prepared?: boolean;
  /**
   * The images attached to the first message. Not in the router state itself
   * — see {@link stashHandoffImages} — but read back with it.
   */
  images?: ComposerImage[];
};

/** The router-state key the composers write and this hook reads. */
export const NEW_SESSION_STATE_KEY = 'newSession';

/**
 * The images of the last hand-off, held in memory under a key the router state
 * carries. Not in the router state: the browser serialises that into its
 * session history (Firefox writes it to disk) and caps its size, and a
 * message's images are megabytes. One slot is enough — a hand-off is read on
 * the very next render of the page it navigates to — and keeps at most one
 * message's images alive.
 */
let stashedImages: { key: string; images: ComposerImage[] } | undefined;

/**
 * Hold a hand-off's images for the session page, returning the key to put in
 * the router state as `imagesKey`, or `undefined` when there are none.
 */
export function stashHandoffImages(
  images: ComposerImage[] | undefined,
): string | undefined {
  if (!images?.length) {
    return undefined;
  }
  stashedImages = { key: crypto.randomUUID(), images };
  return stashedImages.key;
}

function readHandoff(state: unknown): NewSessionHandoff | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const candidate = (state as Record<string, unknown>)[NEW_SESSION_STATE_KEY];
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const { text, agentNamespace, agentName, prepared, imagesKey } =
    candidate as Record<string, unknown>;
  if (
    typeof text !== 'string' ||
    !text ||
    typeof agentNamespace !== 'string' ||
    !agentNamespace ||
    typeof agentName !== 'string' ||
    !agentName
  ) {
    return undefined;
  }

  return {
    text,
    agentNamespace,
    agentName,
    ...(prepared === true ? { prepared: true } : {}),
    // Left in the slot rather than taken: React may run this initialiser
    // twice, and the second run must find them too.
    ...(typeof imagesKey === 'string' && stashedImages?.key === imagesKey
      ? { images: stashedImages.images }
      : {}),
  };
}

/**
 * Consume a {@link NewSessionHandoff} from the router state, exactly once.
 *
 * The state is cleared with a replacing navigation as soon as it has been read,
 * and that is the whole reason this is a hook rather than a `useLocation()` call
 * at the use site. Router state survives a reload and a Back navigation, so a
 * page that read it on every render would re-send the first message every time
 * the user came back to the session — silently starting a second paid turn with
 * the same prompt.
 *
 * The value is held in local state rather than read from the location, so it
 * stays available to the caller after the location has been rewritten.
 */
export function useNewSessionHandoff(): NewSessionHandoff | undefined {
  const location = useLocation();
  const navigate = useNavigate();

  const [handoff] = useState(() => readHandoff(location.state));

  // Cleared in an effect rather than during render: navigating is a side effect,
  // and React may render twice before committing.
  const cleared = useRef(false);
  useEffect(() => {
    if (!handoff || cleared.current) {
      return;
    }
    cleared.current = true;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [handoff, navigate, location.pathname, location.search]);

  return handoff;
}
