import {
  encodeKagentAgentId,
  KagentSession,
  readReportedRuntimeLoss,
  SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentRow } from '../AgentsDataProvider';

/**
 * Shown when kagent has no title for a session. Matches the placeholder kagent's
 * own UI uses, so the two surfaces agree.
 */
export const SESSION_TITLE_FALLBACK = 'Chat';

/**
 * A single session flattened for the table. Plain objects (not domain instances)
 * so sorting and rendering stay trivial and the table layer stays decoupled.
 */
export type SessionRow = {
  /** Stable unique key: `${installation}/${sessionId}`. */
  id: string;
  /**
   * kagent's own session id, verbatim — what a link to the session needs.
   *
   * Carried alongside `id` rather than parsed back out of it: ids are opaque and
   * nothing guarantees one contains no `/`, so splitting would be a format
   * assumption about exactly the value we promise not to assume things about.
   */
  sessionId: string;
  installation: string;
  /**
   * Display title. kagent derives these from the first message and truncates
   * them to 20 characters, so they are short and lossy by nature — the agent
   * column carries much of a row's meaning.
   */
  title: string;
  /** Resolved agent display name, else a lossy decode of the id, else ''. */
  agentName: string;
  /**
   * Matched `Agent` CR's technical name, which seeds the deterministic avatar.
   * Undefined when no CR matched — callers fall back to initials.
   */
  agentTechnicalName?: string;
  /**
   * Matched `Agent` CR's namespace. Undefined when no CR matched.
   *
   * Together with {@link agentTechnicalName} this is the agent's real identity,
   * needed to address it — sending a message goes to
   * `/a2a/<namespace>/<name>`. It deliberately comes from the CR and not from
   * decoding the session's `agent_id`: that encoding rewrites every `-` to `_`,
   * so decoding cannot round-trip a name that genuinely contains an underscore.
   * No match therefore means "we cannot address this agent", not "guess".
   */
  agentNamespace?: string;
  /**
   * The model the matched agent runs on, as the provider names it
   * (`claude-opus-5`), from its ModelConfig's `spec.model`.
   *
   * **The agent's model now, not the model this session ran on.** kagent
   * records no per-session model and does not pin an agent version to a
   * session, so an agent re-pointed at another model since carries the new one
   * here. It is still far closer than any alternative — the cost estimate uses
   * it to pick a per-token rate, and a wrong *tier* of model is a factor-of-
   * two error where no model at all is a factor-of-two error in an unknown
   * direction.
   */
  agentModel?: string;
  createdAt?: string;
  /**
   * kagent reported this session's runtime lost: the agent's working state
   * went with the platform node it was paused on, and no message can reach it
   * any more. The transcript is intact and the session can be deleted; a new
   * session with the same agent is the way on. Marked in the list and the rail
   * so a person finds out before they open it and type. Only the *reported*
   * loss is a row's property — the interim reading needs the conversation,
   * which a list does not have.
   */
  runtimeLost?: boolean;
  /**
   * The Agent revision the session runs on, kept for its whole life. A page
   * that knows the Agent's current revision tells a session started before
   * the last change (to its Harness, prompt or skills) by it.
   */
  preparedRevision?: string;
  /**
   * The session runs on an earlier revision of its agent than the current
   * one. Set only by a page that knows that agent's current revision (see
   * {@link markEarlierRevisions}); a fleet-wide list never sets it.
   */
  earlierRevision?: boolean;
};

/**
 * Encode a namespace/name pair the way kagent does — `kagent/k8s-agent`
 * becomes `kagent__NS__k8s_agent`.
 *
 * We match on this *encode* side rather than decoding an `agent_id`, because
 * encoding is lossless and decoding is not. The one encoder is shared with
 * `normalizeSessionRecord`, which derives a session's `agentId` from its
 * Agent the same way, so the two sides of the join cannot drift.
 */
export function toAgentIdentifier(namespace: string, name: string): string {
  return encodeKagentAgentId(namespace, name);
}

/**
 * Index the already-loaded `Agent` CRs by `${installation}|${encodedAgentId}`.
 *
 * Scoped per installation because the same `agent_id` exists on many
 * installations. Ties — two agents in one namespace differing only by `-` vs `_`,
 * which encode identically — resolve to the first by sorted technical name so the
 * result is at least deterministic.
 */
export function buildAgentIndex(agents: AgentRow[]): Map<string, AgentRow> {
  const index = new Map<string, AgentRow>();

  const sorted = [...agents].sort((a, b) =>
    a.technicalName.localeCompare(b.technicalName),
  );

  for (const agent of sorted) {
    const key = `${agent.installation}|${toAgentIdentifier(
      agent.namespace,
      agent.technicalName,
    )}`;
    if (!index.has(key)) {
      index.set(key, agent);
    }
  }

  return index;
}

/**
 * Best-effort display label when no `Agent` CR matched.
 *
 * Lossy by construction: every `_` becomes `-`, so an agent whose name genuinely
 * contains an underscore is rendered wrongly. Only ever a fallback.
 */
export function decodeAgentIdLabel(agentId: string): string {
  const [namespace, name] = agentId.split('__NS__');
  if (name === undefined) {
    return agentId.replace(/_/g, '-');
  }
  return `${namespace.replace(/_/g, '-')}/${name.replace(/_/g, '-')}`;
}

/** Flatten a {@link KagentSession} into a plain {@link SessionRow}. */
export function toSessionRow(
  session: KagentSession,
  agentIndex: Map<string, AgentRow>,
): SessionRow {
  const match = session.agentId
    ? agentIndex.get(`${session.installation}|${session.agentId}`)
    : undefined;

  let agentName = '';
  if (match) {
    agentName = match.name;
  } else if (session.agentId) {
    agentName = decodeAgentIdLabel(session.agentId);
  }

  return {
    id: session.id,
    sessionId: session.sessionId,
    installation: session.installation,
    title: session.title ?? SESSION_TITLE_FALLBACK,
    agentName,
    agentTechnicalName: match?.technicalName,
    agentNamespace: match?.namespace,
    agentModel: match?.modelName,
    createdAt: session.createdAt,
    runtimeLost: readReportedRuntimeLoss(session) !== undefined,
    preparedRevision: session.preparedRevision,
  };
}

/**
 * Mark the rows of one agent's sessions prepared on a revision other than
 * `currentRevision`, the Agent's latest successful one. Without a current
 * revision, or for a row that does not say its own, nothing is marked: an
 * unknown is not an earlier one.
 */
export function markEarlierRevisions(
  rows: SessionRow[],
  currentRevision: string | undefined,
): SessionRow[] {
  if (!currentRevision) {
    return rows;
  }
  return rows.map(row =>
    row.preparedRevision && row.preparedRevision !== currentRevision
      ? { ...row, earlierRevision: true }
      : row,
  );
}

/** Sort key for a timestamp, placing unknown values last in either direction. */
function timestampValue(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * When a session was last active, epoch ms: the later of its start and the
 * moment its state last moved — a message sent, a reply finished, a question
 * asked. kagent does not move a session's `updatedAt` on a turn
 * (kagent-dev/kagent#2397), so the derived state's `changedAt` is the only
 * record of activity after the start. Undefined when neither is known.
 */
export function lastActiveAt(
  row: SessionRow,
  state?: SessionStateEntry,
): number | undefined {
  const times = [timestampValue(row.createdAt), state?.changedAt].filter(
    (time): time is number => time !== undefined && !Number.isNaN(time),
  );
  return times.length > 0 ? Math.max(...times) : undefined;
}

/**
 * The start of the reader's local calendar day `daysBack` days before `now`,
 * epoch ms. The session lists' day groups (the rail's Today / Previous 7 days,
 * the Sessions page's Today / Yesterday) and the palette's "Today" all cut on
 * it, so a session never sits under Today in one place and not another.
 */
export function localDayStart(now: Date, daysBack: number = 0): number {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysBack,
  ).getTime();
}

/**
 * The first of `buckets` whose window holds `activeAt` (epoch ms), each
 * bucket reaching back to the local day start `daysBack` days ago; `fallback`
 * past the last one, and for an unknown time. A time later than `now` (clock
 * skew) lands in the first bucket.
 */
export function dayBucket<G extends string>(
  activeAt: number | undefined,
  now: Date,
  buckets: ReadonlyArray<{ id: G; daysBack: number }>,
  fallback: G,
): G {
  if (activeAt === undefined || Number.isNaN(activeAt)) {
    return fallback;
  }
  const bucket = buckets.find(
    ({ daysBack }) => activeAt >= localDayStart(now, daysBack),
  );
  return bucket?.id ?? fallback;
}

/**
 * The one recency order of the session lists (T100 M1): most recently active
 * first (see {@link lastActiveAt}), a session with no known time last, the
 * title breaking ties. The rail and the Sessions page both sort with this, so
 * the same two sessions never read in opposite orders.
 */
export function byLastActive<T extends Pick<SessionRow, 'title'>>(
  activeAtOf: (row: T) => number | undefined,
): (a: T, b: T) => number {
  return (a, b) => {
    const aTime = activeAtOf(a);
    const bTime = activeAtOf(b);
    if (aTime !== bTime) {
      if (aTime === undefined) return 1;
      if (bTime === undefined) return -1;
      return bTime - aTime;
    }
    return a.title.localeCompare(b.title);
  };
}

/**
 * Default ordering: the home installation's sessions first, then everyone
 * else's; within that, newest first, then title. Without a `home` it is
 * newest first alone. By start rather than by `updatedAt`, which kagent API v2
 * does not move on a turn (kagent-dev/kagent#2397).
 */
export function sortSessionRows(
  rows: SessionRow[],
  home?: string,
): SessionRow[] {
  const rank = (installation: string) =>
    home !== undefined && installation === home ? 0 : 1;
  return [...rows].sort((a, b) => {
    const byHome = rank(a.installation) - rank(b.installation);
    if (byHome !== 0) {
      return byHome;
    }
    const aTime = timestampValue(a.createdAt);
    const bTime = timestampValue(b.createdAt);
    if (aTime !== bTime) {
      // Rows with no timestamp sort last regardless of direction.
      if (aTime === undefined) return 1;
      if (bTime === undefined) return -1;
      return bTime - aTime;
    }
    return a.title.localeCompare(b.title);
  });
}

/** Free-text search over the title and the agent name. */
export function sessionSearchFn<T extends SessionRow>(
  rows: T[],
  search: string,
): T[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter(
    row =>
      row.title.toLowerCase().includes(needle) ||
      row.agentName.toLowerCase().includes(needle) ||
      row.installation.toLowerCase().includes(needle),
  );
}
