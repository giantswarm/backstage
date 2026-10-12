import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * The first message of a session that was just started, carried from whichever
 * composer started it to the session detail page. agent-manager's
 * `start_session` already sent it; the page shows it until its first read of the
 * conversation has it, so the prompt appears immediately rather than after a
 * beat of empty conversation.
 *
 * The agent travels with the prompt on purpose. The detail page can resolve a
 * session's agent on its own, but only after the session read has landed *and*
 * joined against the fleet-wide `Agent` list — two renders later at best.
 * Carrying it means the composer is addressed from the first render.
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

  const { text, agentNamespace, agentName, prepared } = candidate as Record<
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

  return {
    text,
    agentNamespace,
    agentName,
    ...(prepared === true ? { prepared: true } : {}),
  };
}

/**
 * Consume a {@link NewSessionHandoff} from the router state, exactly once.
 *
 * The state is cleared with a replacing navigation as soon as it has been read,
 * and that is the whole reason this is a hook rather than a `useLocation()` call
 * at the use site. Router state survives a reload and a Back navigation, so a
 * page that read it on every render would, on every return to the session,
 * caption a message as the portal's or show a stand-in for one that is long in
 * the conversation.
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
