import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
};

/** The router-state key the composers write and this hook reads. */
export const NEW_SESSION_STATE_KEY = 'newSession';

function readHandoff(state: unknown): NewSessionHandoff | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const candidate = (state as Record<string, unknown>)[NEW_SESSION_STATE_KEY];
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const { text, agentNamespace, agentName } = candidate as Record<
    string,
    unknown
  >;
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

  return { text, agentNamespace, agentName };
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
