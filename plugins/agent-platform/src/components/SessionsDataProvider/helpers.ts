import {
  encodeKagentAgentId,
  KagentSession,
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
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Encode a namespace/name pair the way kagent does — `kagent/k8s-agent`
 * becomes `kagent__NS__k8s_agent`.
 *
 * We match on this *encode* side rather than decoding an `agent_id`, because
 * encoding is lossless and decoding is not. The one encoder is shared with
 * `normalizeAgentInstance`, which derives a session's `agentId` from its
 * template the same way, so the two sides of the join cannot drift.
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
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
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
 * Default ordering: the home installation's sessions first, then everyone
 * else's; within that, most recent activity first, then title. Without a
 * `home` it is recency alone.
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
    const aTime = timestampValue(a.updatedAt);
    const bTime = timestampValue(b.updatedAt);
    if (aTime !== bTime) {
      // Rows with no timestamp sort last regardless of direction.
      if (aTime === undefined) return 1;
      if (bTime === undefined) return -1;
      return bTime - aTime;
    }
    return a.title.localeCompare(b.title);
  });
}

/**
 * Sort rows for the table, by column id and direction.
 *
 * Timestamp columns compare parsed times so string ordering can't mislead, and
 * rows with an unknown timestamp always sort last — in *both* directions, since
 * "unknown" is not "oldest".
 */
export function sortSessionsBy(
  rows: SessionRow[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): SessionRow[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;

  return [...rows].sort((a, b) => {
    if (column === 'createdAt' || column === 'updatedAt') {
      const aTime = timestampValue(a[column]);
      const bTime = timestampValue(b[column]);
      if (aTime === bTime) {
        return a.title.localeCompare(b.title);
      }
      if (aTime === undefined) return 1;
      if (bTime === undefined) return -1;
      return (aTime - bTime) * factor;
    }

    const aValue = String(a[column as keyof SessionRow] ?? '');
    const bValue = String(b[column as keyof SessionRow] ?? '');
    return aValue.localeCompare(bValue) * factor;
  });
}

/** Free-text search over the title and the agent name. */
export function sessionSearchFn(
  rows: SessionRow[],
  search: string,
): SessionRow[] {
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
