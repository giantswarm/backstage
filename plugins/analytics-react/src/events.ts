/**
 * The meaningful actions the portal reports, one entry per event.
 *
 * An event name follows TelemetryDeck's naming guide: a capitalized prefix per
 * level, a past-tense last part, at most three levels. Every attribute takes
 * one value of a closed set, or is a count, so free text (prompts, entity
 * names, URLs, search terms) cannot reach an event: customer portals send the
 * same events.
 */

/**
 * An attribute that is a count: an exact whole number, 0 or more, and never a
 * name or an id. Left out of the event when the count could not be
 * determined, so every count an event carries is a number.
 */
export const COUNT = 'count';

export type PortalEventSpec = {
  /** What happened, in one sentence; the public list of events shows it. */
  description: string;
  /** Each attribute's closed set of values, or {@link COUNT}. */
  attributes: Record<string, readonly string[] | typeof COUNT>;
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
      workspace: ['picked', 'none'],
    },
  },
  'AgentPlatform.messageSent': {
    description:
      "A message was sent to the agent in a session, a first message included, and the agent took it; with the session's number of turns once the message's turn is over, that turn included (left out when the session's turns were never read).",
    attributes: { turns: COUNT },
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
  'AgentPlatform.sessionExported': {
    description:
      'A session was exported to a file, whole, from its actions menu; the number of its tasks is given in coarse buckets.',
    attributes: { tasks: ['0', '1-9', '10-99', '100+'] },
  },
  'AgentPlatform.agentViewed': {
    description:
      "An agent's page was opened, with the number of skills it has and of tools it can call through the person viewing it: its declared toolset as muster resolves it for them, plus the tools it lists on servers it binds directly (`tools` left out when it declares no toolset, the toolset could not be resolved, or a directly bound server allows all its tools). Sent once per opening, when both are read.",
    attributes: { skills: COUNT, tools: COUNT },
  },
  'AgentPlatform.sessionViewed': {
    description:
      "A session's page was opened, with the number of turns the session has. Sent once per opening, when the session is read and its turns were read within the last minute, not from an older cache.",
    attributes: { turns: COUNT },
  },
  'AgentPlatform.customizeViewed': {
    description:
      'The Customize page was opened, with the number of agents, skills, connectors, models, workflows, workspaces and toolchains it counts for the installations in scope. Sent once per opening, not per tab, when every count has finished loading; a count that an installation or a skill repository could not be read for is left out, never sent as a partial total.',
    attributes: {
      agents: COUNT,
      skills: COUNT,
      connectors: COUNT,
      models: COUNT,
      workflows: COUNT,
      workspaces: COUNT,
      toolchains: COUNT,
    },
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
      "A session's notification level was set: `default`, `all` or `muted`.",
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
  'AgentPlatform.workspaceSaved': {
    description:
      'A workspace, the repositories agent sessions work on, was created or its sources changed, as the signed-in person.',
    attributes: { kind: ['created', 'updated'] },
  },
  'AgentPlatform.toolchainCreated': {
    description:
      'A toolchain, tools a coding agent session mounts, was opened as a pull request in a toolchain source, as the signed-in person.',
    attributes: {},
  },
  'AgentPlatform.toolchainSourceAdded': {
    description:
      'A repository was added as a toolchain source, offered at once (an owner of the installation added it) or waiting for an owner to approve it.',
    attributes: { approval: ['approved', 'pending'] },
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
  'AgentPlatform.organizationMemberAdded': {
    description:
      "A group or a person was added to an Agent Platform organization with a role, on the organization's page, as the signed-in person.",
    attributes: {
      kind: ['group', 'person'],
      role: ['admin', 'editor', 'user'],
    },
  },
  'AgentPlatform.organizationCredentialSaved': {
    description:
      "A credential (a model key, a connector or an egress credential) was saved on an Agent Platform organization's credential form, as the signed-in person: live, or as a pull request. Never the value.",
    attributes: { mode: ['apply', 'commit'] },
  },
  'AgentPlatform.organizationMemberRemoved': {
    description:
      "A group or a person was removed from an Agent Platform organization's roles, on the organization's page, as the signed-in person.",
    attributes: { kind: ['group', 'person'] },
  },
  'AgentPlatform.defaultModelSet': {
    description:
      "A model (a kagent ModelConfig) was made its namespace's default in the Agent Platform, on its page, as the signed-in person. A model the model form marks as it is created is not counted.",
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

type SpecOf<N extends PortalEventName> = PortalEvents[N]['attributes'];

/** The attributes of an event that are counts. */
type CountKeys<A> = {
  [K in keyof A]: A[K] extends typeof COUNT ? K : never;
}[keyof A];

/**
 * An event's attributes: each closed-set one with one of its values, each
 * count a number or left out.
 */
export type PortalEventAttributes<N extends PortalEventName> = {
  -readonly [
    K in Exclude<keyof SpecOf<N>, CountKeys<SpecOf<N>>>
  ]: SpecOf<N>[K] extends readonly (infer V)[] ? V : never;
} & {
  -readonly [K in CountKeys<SpecOf<N>>]?: number;
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

/** Whether a value can be a count: a whole number, 0 or more. */
export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * The event, when the action is on the list and its attributes are the
 * listed ones, each closed-set attribute with an allowed value and each count
 * a whole number of 0 or more or left out; otherwise undefined.
 */
export function toPortalEvent(
  action: string,
  attributes: Record<string, string | boolean | number> = {},
): PortalEvent | undefined {
  if (!Object.hasOwn(portalEvents, action)) {
    return undefined;
  }
  const spec: PortalEventSpec = portalEvents[action as PortalEventName];
  if (
    Object.keys(attributes).some(key => !Object.hasOwn(spec.attributes, key))
  ) {
    return undefined;
  }
  const valid = Object.entries(spec.attributes).every(([key, allowed]) => {
    const value = attributes[key];
    if (allowed === COUNT) {
      return !Object.hasOwn(attributes, key) || isCount(value);
    }
    return typeof value === 'string' && allowed.includes(value);
  });
  return valid
    ? ({ name: action, attributes } as unknown as PortalEvent)
    : undefined;
}
