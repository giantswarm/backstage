import { KagentSession } from '../../lib/kagentSessions';
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
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Encode a namespace/name pair the way kagent does.
 *
 * kagent's `ConvertToPythonIdentifier` replaces every `-` with `_` and then `/`
 * with `__NS__` (`go/core/internal/utils/common.go`), so `kagent/k8s-agent`
 * becomes `kagent__NS__k8s_agent`.
 *
 * We match on this *encode* side rather than decoding kagent's `agent_id`,
 * because encoding is lossless and decoding is not.
 */
export function toAgentIdentifier(namespace: string, name: string): string {
  return `${namespace}/${name}`.replace(/-/g, '_').replace('/', '__NS__');
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
    installation: session.installation,
    title: session.title ?? SESSION_TITLE_FALLBACK,
    agentName,
    agentTechnicalName: match?.technicalName,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Whether a session belongs in the list.
 *
 * A2A subagent sessions (`source === 'agent'`) are child threads spawned by a
 * parent agent, not work the user started, so they are excluded.
 *
 * Note this is forward-compatibility rather than active filtering: live kagent
 * v0.9.9 responses omit `source` entirely, so nothing is hidden today. An absent
 * or unrecognised value is listable — only an explicit `'agent'` is not.
 */
export function isListableSession(session: KagentSession): boolean {
  return session.source !== 'agent';
}

/** Sort key for a timestamp, placing unknown values last in either direction. */
function timestampValue(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Default ordering: most recent activity first, then title. */
export function sortSessionRows(rows: SessionRow[]): SessionRow[] {
  return [...rows].sort((a, b) => {
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
