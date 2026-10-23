import {
  countNoun,
  joinNames,
  NAMED_IN_SENTENCE,
} from '@giantswarm/backstage-plugin-ui-react';

/** `a`, `a and b`, `a, b and c`; past a sentence's worth, `joinNames`'s count. */
function listInSentence(names: readonly string[]): string {
  if (names.length < 2 || names.length > NAMED_IN_SENTENCE) {
    return joinNames(names);
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Every word of an egress refusal as the portal says it: the Session's alert
 * (`EgressRefusedEntry`) and the review step's refusal (`Violations`). Kept in
 * one place so other surfaces that report the same refusal, such as
 * klaus-gateway's Slack notice, can say it the same way
 * (giantswarm/giantswarm#38814).
 *
 * Placeholders: `agent` is the agent's name as the page shows it (or "this
 * agent"), `subject` the same opening a sentence (or "This agent"); `host` the
 * refused host (or "this address" where the gateway folded it); `origin` the
 * origin an agent's Extra egress origins would need, `https://host[:port]`;
 * `runtime` the Harness as a person names it ("Claude Code").
 */
export const EGRESS_ALERT_COPY = {
  /** Stand-ins where the page has no name or host. */
  agentStandIn: 'this agent',
  subjectStandIn: 'This agent',
  addressStandIn: 'this address',

  title: (host: string | undefined) =>
    host
      ? `Outgoing connection to ${host} blocked`
      : 'Outgoing connection blocked',
  /** The first line: reason · time · count. */
  reason: (subject: string) =>
    `${subject} is not allowed to reach this address`,
  tcpReason: 'Raw TCP connections are not available to agents',
  attempts: (count: number) => countNoun(count, 'attempt'),

  remedy: {
    /** Coding Harness, Sessions mount toolchains; an http(s) destination. */
    toolchains: (subject: string, runtime: string, host: string) =>
      `${subject} can only reach the addresses the platform allows for ${runtime}. Start a session with a toolchain that includes ${host}, or ask your platform team to allow it.`,
    /**
     * Coding Harness without toolchains, or with them for a destination no
     * toolchain declares (raw TCP, a folded host).
     */
    platform: (subject: string, runtime: string, host: string) =>
      `${subject} can only reach the addresses the platform allows for ${runtime}. Ask your platform team to allow ${host}.`,
    /** Defined in Git where the portal cannot change it. */
    git: (subject: string) =>
      `${subject} is defined in Git. Its egress is changed there.`,
    /** The portal can change it, but not as this person. */
    askEditor: (agent: string, host: string) =>
      `An editor of ${agent} can allow ${host}.`,
    /** The person can change it: the origin is known. */
    edit: (agent: string, origin: string) =>
      `You can allow it: add ${origin} to ${agent}’s Extra egress origins.`,
    /** The person can change it, for a folded host. */
    editUnnamed: (agent: string) =>
      `You can allow it in ${agent}’s egress settings.`,
    /** The person can change it, for a raw TCP destination. */
    editTcp: (subject: string) =>
      `${subject}’s egress settings list the HTTP and HTTPS origins it may reach.`,
    /** The agent could not be read: nothing is promised. */
    neutral: (agent: string, host: string) =>
      `If ${agent} needs ${host}, ask your platform team.`,
  },

  links: {
    toolchains: 'Toolchains',
    newSession: 'Start a session',
    agentPage: (subject: string) => `${subject}’s page`,
    edit: (agent: string) => `Edit ${agent}`,
  },

  details: {
    title: 'Technical details',
    /** `registry.npmjs.org:443 (https)` */
    destination: 'Destination',
    /** The destination where the gateway folded the host. */
    unnamedHost: 'an unnamed host',
    origin: 'Origin',
  },
} as const;

/**
 * The review step's refusal (`validate_agent`'s violations): what to do
 * first, agent-manager's words folded under Technical details.
 */
export const VALIDATION_REFUSAL_COPY = {
  createTitle: 'This agent cannot be created',
  editTitle: 'This change cannot be saved',
  /** "Claude Code agents"; the Harness by name where the form has no title. */
  agentsOn: (runtime: string | undefined, harness: string) =>
    runtime ? `${runtime} agents` : `Agents on the Harness ${harness}`,
  /** An extra egress origin refused on a coding Harness (`codingEgressRefusal`). */
  codingEgress: (agents: string, origins: readonly string[]) =>
    `${agents} can only reach addresses the platform allows. Remove ${listInSentence(
      origins,
    )}, or ask your platform team to allow ${origins.length === 1 ? 'it' : 'them'}.`,
  /** Any refusal the portal does not recognise; `more` beside a recognised one. */
  generic: (more: boolean) =>
    `${
      more
        ? 'The platform’s checks refused more of it.'
        : 'The platform’s checks refused this configuration.'
    } Change what the technical details name, or ask your platform team for help.`,
  detailsTitle: 'Technical details',
} as const;
