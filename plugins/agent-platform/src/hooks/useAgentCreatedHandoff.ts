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
  /**
   * Which write the page is watching converge: a create (the default), an
   * edit's Save, or Update skills. Only the copy differs — every write ends
   * the same way, with the platform Harness compiling a new revision.
   */
  action?: AgentWriteAction;
  /**
   * The template's generation immediately before the write, when it could be
   * read. The progress treats a verdict as this write's answer only once the
   * generation has moved past it — without that, an agent that was already
   * `ready` reports success before the Harness has compiled anything. Absent
   * for a create, which has no earlier generation.
   */
  fromGeneration?: number;
};

/** The writes after which the detail page shows the template converging. */
export type AgentWriteAction = 'created' | 'updated' | 'skills-updated';

const WRITE_ACTIONS: readonly AgentWriteAction[] = [
  'created',
  'updated',
  'skills-updated',
];

/** The router-state key the review page writes and this hook reads. */
export const AGENT_CREATED_STATE_KEY = 'agentCreated';

function readHandoff(state: unknown): AgentCreatedHandoff | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const candidate = (state as Record<string, unknown>)[AGENT_CREATED_STATE_KEY];
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
  const { action, fromGeneration } = candidate as Record<string, unknown>;
  return {
    installation,
    namespace,
    name,
    requestedBy: typeof requestedBy === 'string' ? requestedBy : undefined,
    action: WRITE_ACTIONS.includes(action as AgentWriteAction)
      ? (action as AgentWriteAction)
      : 'created',
    fromGeneration:
      typeof fromGeneration === 'number' ? fromGeneration : undefined,
  };
}

/**
 * Consume an {@link AgentCreatedHandoff} from the router state, exactly once.
 *
 * Router state survives a reload and a Back navigation; clearing it with a
 * replacing navigation as soon as it is read keeps the progress element from
 * reappearing on every later visit to the page. The value is held in local
 * state so it outlives that clearing for the life of the mounted page.
 *
 * The handoff is picked up whenever it appears in the location, not only at
 * mount. A write made from the page the progress renders on — `Update skills`
 * from the kebab, which navigates to the URL it is already on — replaces
 * `location.state` without unmounting anything, so a mount-time-only read never
 * saw it: the progress stayed absent, and because nothing was read nothing was
 * cleared either, so the next reload of that URL replayed it out of nowhere.
 */
export function useAgentCreatedHandoff(): AgentCreatedHandoff | undefined {
  const location = useLocation();
  const navigate = useNavigate();
  const [handoff, setHandoff] = useState(() => readHandoff(location.state));
  // The history entry the initializer above already took its value from.
  // Re-adopting it would re-render for an equal value; a *later* write to the
  // same URL arrives as a different object, and that is the one to catch.
  const consumed = useRef(location.state);

  useEffect(() => {
    const arriving = readHandoff(location.state);
    if (!arriving) {
      return;
    }

    if (location.state !== consumed.current) {
      consumed.current = location.state;
      setHandoff(arriving);
    }

    // Take it out of the history entry either way. That is also what ends this
    // effect: the replacing navigation leaves a state with no handoff in it, so
    // the next run reads nothing and stops.
    const { [AGENT_CREATED_STATE_KEY]: _consumed, ...rest } = (location.state ??
      {}) as Record<string, unknown>;
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: Object.keys(rest).length ? rest : undefined },
    );
  }, [location.pathname, location.search, location.state, navigate]);

  return handoff;
}
