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
  'AgentPlatform.agentUpdated': {
    description:
      "An agent's configuration was changed in the Agent Platform — edited, or its skills moved to their latest commits — applied live or committed to Git as a pull request.",
    attributes: {
      mode: ['apply', 'commit'],
      change: ['edited', 'skillsRefreshed'],
    },
  },
  'AgentPlatform.agentDeleted': {
    description:
      'An agent was deleted in the Agent Platform, live or committed to Git as a pull request; a live delete that found nothing left to remove is not counted.',
    attributes: { mode: ['apply', 'commit'] },
  },
  'AgentPlatform.sessionStarted': {
    description: 'A session with an agent was started.',
    attributes: {
      entryPoint: [
        'sessionsList',
        'agentDetail',
        'sessionDetail',
        'home',
        'skillDetail',
        'createAgentAssist',
        'searchPalette',
        'skillCreationAssist',
        'workflowEdit',
        'workflowCreateAssist',
      ],
    },
  },
  'AgentPlatform.messageSent': {
    description:
      'A message was sent to the agent in a session, a first message included, and the agent took it.',
    attributes: {},
  },
  'AgentPlatform.questionAnswered': {
    description:
      "An agent's question in a session was answered, and the agent took the answer.",
    attributes: {},
  },
  'AgentPlatform.turnStopped': {
    description: "A session's running turn was stopped.",
    attributes: {},
  },
  'AgentPlatform.sessionRenamed': {
    description: 'A session was renamed.',
    attributes: {},
  },
  'AgentPlatform.sessionDeleted': {
    description: 'A session was deleted.',
    attributes: {},
  },
  'AgentPlatform.sessionPinChanged': {
    description:
      "A session was pinned to, or unpinned from, the top of the person's session lists.",
    attributes: { change: ['pinned', 'unpinned'] },
  },
  'AgentPlatform.agentFavoriteChanged': {
    description:
      "An agent was added to, or removed from, the person's favorites.",
    attributes: { change: ['added', 'removed'] },
  },
  'AgentPlatform.toolActivityChanged': {
    description:
      "The session page's tool activity was shown or hidden, a choice kept for the person's later sessions.",
    attributes: { change: ['shown', 'hidden'] },
  },
  'AgentPlatform.sessionNotificationLevelChanged': {
    description:
      "A session's notification level was set: default, all activity or muted.",
    attributes: { level: ['default', 'all', 'muted'] },
  },
  'AgentPlatform.notificationOpened': {
    description:
      "An unread row of the Notification inbox was opened, which marks it read: a session waiting, failed or with a finished turn, the MCP sign-in row's Sign in, or a plain row another portal feature sent.",
    attributes: {
      kind: ['waiting', 'failed', 'turnFinished', 'mcpSignIn', 'plain'],
    },
  },
  'AgentPlatform.notificationsMarkedRead': {
    description: 'Every unread row of the Notification inbox was marked read.',
    attributes: {},
  },
  'AgentPlatform.skillProposed': {
    description:
      'A new skill, or a change to an existing one, was proposed to a skill repository, as a pull request opened as the signed-in person.',
    attributes: { kind: ['created', 'updated'] },
  },
  'AgentPlatform.modelCreated': {
    description:
      "A model an agent can use (a kagent ModelConfig) was created in the Agent Platform, through the model form. The models a model backend's addition registers are not counted.",
    attributes: {},
  },
  'AgentPlatform.modelUpdated': {
    description:
      "A model's configuration (a kagent ModelConfig) was changed in the Agent Platform, through the model form.",
    attributes: {},
  },
  'AgentPlatform.modelDeleted': {
    description:
      "A model (a kagent ModelConfig) was deleted in the Agent Platform, on its page. The models a model backend's removal takes along are not counted.",
    attributes: {},
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
  'Scaffolder.taskStarted': {
    description: 'A software template was submitted and its task started.',
    attributes: {},
  },
  'Muster.mcpServerAdded': {
    description:
      "An MCP server was registered in muster, through the wizard or its registration tool's page.",
    attributes: {
      authMode: ['none', 'own-account', 'platform-sso', 'sigv4'],
    },
  },
  'Muster.mcpServerUpdated': {
    description:
      "An MCP server's definition was edited in muster: through the wizard opened from its Edit, as JSON on its page, or on its update tool's page.",
    attributes: {},
  },
  'Muster.mcpServerConnectionChanged': {
    description:
      "An MCP server was activated, deactivated or reconnected in muster, on its page or on the tool's page.",
    attributes: { change: ['activated', 'deactivated', 'reconnected'] },
  },
  'Muster.mcpServerDeleted': {
    description:
      "An MCP server was deleted from muster, on its page or on the delete tool's page.",
    attributes: {},
  },
  'Muster.workflowRan': {
    description:
      "A muster workflow was run from the Agent Platform, on its page or its tool's, and returned a result.",
    attributes: {},
  },
  'Muster.toolRan': {
    description:
      "A muster tool was run from its page in the Agent Platform and returned a result. A workflow's run and muster's connector tools report their own events instead; any other tool counts here, including a write another page reports as its own event (an agent's deletion, say).",
    attributes: {},
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
