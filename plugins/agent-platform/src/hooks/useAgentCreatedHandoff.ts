import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * What the review page hands to the detail page after `create_agent` landed:
 * which agent was just created, and who agent-manager says created it. The
 * detail page then shows the template converging on the platform Harness
 * (`get_agent_status` until ready or failed) — the progress a person expects
 * right after pressing Deploy, which the page's own readiness label only
 * catches up with on its next poll.
 */
export type AgentCreatedHandoff = {
  installation: string;
  namespace: string;
  name: string;
  /** The authenticated caller agent-manager wrote the release as. */
  requestedBy?: string;
};

/** The router-state key the review page writes and this hook reads. */
export const AGENT_CREATED_STATE_KEY = 'agentCreated';

function readHandoff(state: unknown): AgentCreatedHandoff | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const candidate = (state as Record<string, unknown>)[
    AGENT_CREATED_STATE_KEY
  ];
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }
  const { installation, namespace, name, requestedBy } = candidate as Record<
    string,
    unknown
  >;
  if (
    typeof installation !== 'string' ||
    !installation ||
    typeof namespace !== 'string' ||
    !namespace ||
    typeof name !== 'string' ||
    !name
  ) {
    return undefined;
  }
  return {
    installation,
    namespace,
    name,
    requestedBy: typeof requestedBy === 'string' ? requestedBy : undefined,
  };
}

/**
 * Consume an {@link AgentCreatedHandoff} from the router state, exactly once.
 *
 * Router state survives a reload and a Back navigation; clearing it with a
 * replacing navigation as soon as it is read keeps the progress element from
 * reappearing on every later visit to the page. The value is held in local
 * state so it outlives that clearing for the life of the mounted page.
 */
export function useAgentCreatedHandoff(): AgentCreatedHandoff | undefined {
  const location = useLocation();
  const navigate = useNavigate();
  const [handoff] = useState(() => readHandoff(location.state));
  const cleared = useRef(false);

  useEffect(() => {
    if (handoff && !cleared.current) {
      cleared.current = true;
      const { [AGENT_CREATED_STATE_KEY]: _consumed, ...rest } =
        (location.state ?? {}) as Record<string, unknown>;
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: Object.keys(rest).length ? rest : undefined },
      );
    }
  }, [handoff, location.pathname, location.search, location.state, navigate]);

  return handoff;
}
