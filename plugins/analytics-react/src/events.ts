/**
 * The meaningful actions the portal reports, one entry per event.
 *
 * An event name follows TelemetryDeck's naming guide: a capitalized prefix per
 * level, a past-tense last part, at most three levels. Every attribute takes
 * one value of a closed set, so free text (prompts, entity names, URLs, search
 * terms) cannot reach an event: customer portals send the same events.
 */
export type PortalEventSpec = {
  /** What happened, in one sentence; the public list of events shows it. */
  description: string;
  attributes: Record<string, readonly string[]>;
};

export function defineEvents<
  const T extends Record<`${Capitalize<string>}.${string}`, PortalEventSpec>,
>(events: T): T {
  return events;
}

export const portalEvents = defineEvents({
  'AgentPlatform.agentCreated': {
    description:
      'An agent was created in the Agent Platform, deployed live or committed to Git as a pull request.',
    attributes: { mode: ['deploy', 'commit'] },
  },
  'AgentPlatform.sessionStarted': {
    description: 'A session with an agent was started.',
    attributes: {
      entryPoint: ['sessionsList', 'agentDetail', 'sessionDetail'],
    },
  },
  'AgentPlatform.clusterCreated': {
    description:
      'A workload cluster was created through cluster-manager, applied live or committed to Git.',
    attributes: { mode: ['apply', 'commit'] },
  },
  'AgentPlatform.nodePoolCreated': {
    description:
      'A GPU node pool was added to a cluster through cluster-manager, applied live or committed to Git.',
    attributes: { mode: ['apply', 'commit'] },
  },
  'Muster.mcpServerAdded': {
    description: 'An MCP server was registered in muster through the wizard.',
    attributes: {
      authMode: ['none', 'own-account', 'platform-sso', 'sigv4'],
    },
  },
});

type PortalEvents = typeof portalEvents;

export type PortalEventName = keyof PortalEvents;

export type PortalEventAttributes<N extends PortalEventName> = {
  -readonly [
    K in keyof PortalEvents[N]['attributes']
  ]: PortalEvents[N]['attributes'][K] extends readonly (infer V)[] ? V : never;
};

/** One event as a plugin reports it: a name on the list and its attributes. */
export type PortalEvent = {
  [N in PortalEventName]: { name: N; attributes: PortalEventAttributes<N> };
}[PortalEventName];

/**
 * Whether an analytics action is named like one of ours. Backstage's built-in
 * actions (`navigate`, `click`, `create`, `search`, `discover`) are single
 * lowercase words; ours carry a capitalized prefix. An action named like ours
 * but missing from the list is a plugin bug, not a foreign event.
 */
export function isPortalEventShaped(action: string): boolean {
  return /^[A-Z][A-Za-z]*(\.[A-Z][A-Za-z]*)?\.[a-z][A-Za-z]*$/.test(action);
}

/**
 * The event, when the action is on the list and its attributes are exactly
 * the listed ones, each with an allowed value; otherwise undefined.
 */
export function toPortalEvent(
  action: string,
  attributes: Record<string, string | boolean | number> = {},
): PortalEvent | undefined {
  if (!Object.hasOwn(portalEvents, action)) {
    return undefined;
  }
  const spec: PortalEventSpec = portalEvents[action as PortalEventName];
  const keys = Object.keys(attributes);
  const allowed = Object.entries(spec.attributes);
  if (keys.length !== allowed.length) {
    return undefined;
  }
  const valid = allowed.every(
    ([key, values]) =>
      typeof attributes[key] === 'string' &&
      values.includes(attributes[key] as string),
  );
  return valid
    ? ({ name: action, attributes } as unknown as PortalEvent)
    : undefined;
}
