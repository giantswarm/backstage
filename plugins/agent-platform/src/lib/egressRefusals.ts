import type { TimelineItem } from './kagentTimeline';

/**
 * The egress refusals of one Session, from the Substrate egress gateway's
 * `agentgateway_atenet_egress_refusals_total`: one series per actor and refused
 * destination (`scheme`, `host`, `port`). A Session runs as one Substrate actor,
 * so the actor's series are the Session's refusals and nobody else's.
 */
export const EGRESS_REFUSALS_METRIC =
  'agentgateway_atenet_egress_refusals_total';

/** What the gateway writes for a destination it does not name (see the metric's bounds). */
const FOLDED = 'other';

/** One series of a range query, as Mimir answers it. */
type MatrixSeries = {
  metric: Record<string, string>;
  values: [number, string][];
};

/**
 * The Substrate actor a kagent Session runs as: kagent names it after the
 * Session (`substrate.ActorName`) in the agent's namespace, its atespace.
 */
export function sessionActor(
  sessionId: string,
  agentNamespace: string,
): { atespace: string; name: string } {
  return {
    atespace: agentNamespace,
    name: `session-${sessionId.toLowerCase()}`,
  };
}

function promLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** The PromQL for one actor's refusals, one series per destination. */
export function egressRefusalsQuery(actor: {
  atespace: string;
  name: string;
}): string {
  return `sum by (scheme, host, port) (${EGRESS_REFUSALS_METRIC}{ate_atespace="${promLabelValue(actor.atespace)}",ate_actor_name="${promLabelValue(actor.name)}"})`;
}

export type EgressRefusal = {
  scheme: string;
  /** Absent when the gateway folded the destination (`host="other"`). */
  host?: string;
  port?: number;
  /** RFC3339: the sample that saw the refusals. */
  at: string;
  /**
   * RFC3339: the sample before it, after which they happened; absent for a
   * series' first sample.
   */
  since?: string;
  count: number;
};

/**
 * Each rise of a refusal counter, at the sample that saw it. A counter reads
 * its total, so a rise between two samples is that many refusals since the
 * first; a series' first sample is all of its refusals (it is born by one),
 * and a fall is a restarted gateway counting from zero.
 */
export function readEgressRefusals(
  series: readonly MatrixSeries[],
): EgressRefusal[] {
  const refusals: EgressRefusal[] = [];
  const iso = (timestamp: number) => new Date(timestamp * 1000).toISOString();
  for (const { metric, values } of series) {
    const scheme = metric.scheme ?? 'https';
    const folded = !metric.host || metric.host === FOLDED;
    const port = Number(metric.port);
    let previous: { at: number; value: number } | undefined;
    for (const [timestamp, raw] of values) {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        continue;
      }
      const before = previous?.value ?? 0;
      const count = value >= before ? value - before : value;
      if (count > 0) {
        refusals.push({
          scheme,
          host: folded ? undefined : metric.host,
          port:
            folded || !Number.isFinite(port) || port <= 0 ? undefined : port,
          at: iso(timestamp),
          since: previous ? iso(previous.at) : undefined,
          count: Math.round(count),
        });
      }
      previous = { at: timestamp, value };
    }
  }
  return refusals.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The origin an agent's `spec.egress` would need for a refused destination, or
 * undefined when no origin can allow it: a tcp destination (the field takes
 * http(s) origins only) or one the gateway did not name.
 */
export function egressOriginFor(refusal: {
  scheme: string;
  host?: string;
  port?: number;
}): string | undefined {
  if (
    !refusal.host ||
    (refusal.scheme !== 'https' && refusal.scheme !== 'http')
  ) {
    return undefined;
  }
  const defaultPort = refusal.scheme === 'https' ? 443 : 80;
  const port =
    refusal.port && refusal.port !== defaultPort ? `:${refusal.port}` : '';
  return `${refusal.scheme}://${refusal.host}${port}`;
}

export type EgressRefusedItem = Extract<
  TimelineItem,
  { kind: 'egress-refused' }
>;

/**
 * The timeline with each refusal on the turn that met it: one entry per turn
 * and destination, counting its refusals, placed before the turn's closing
 * answer (the answer that says what the agent made of it), or at the turn's
 * end.
 *
 * Every item carries its task's timestamp, which is when the turn last moved,
 * so a turn ends at its `at`: a refusal belongs to the first turn that ended
 * after it happened (after its `since`), and to the newest turn when none did
 * — the turn still running.
 */
export function withEgressRefusals(
  items: readonly TimelineItem[],
  refusals: readonly EgressRefusal[],
): TimelineItem[] {
  if (refusals.length === 0 || items.length === 0) {
    return items as TimelineItem[];
  }
  const turnEnds: { taskIndex: number; at?: string }[] = [];
  for (const item of items) {
    if (turnEnds[turnEnds.length - 1]?.taskIndex !== item.taskIndex) {
      turnEnds.push({ taskIndex: item.taskIndex, at: item.at });
    }
  }
  const turnOf = (refusal: EgressRefusal): number => {
    const happened = refusal.since ?? refusal.at;
    const turn = turnEnds.find(
      end => end.at !== undefined && end.at >= happened,
    );
    return (turn ?? turnEnds[turnEnds.length - 1]).taskIndex;
  };

  const entries = new Map<string, EgressRefusedItem>();
  for (const refusal of refusals) {
    const taskIndex = turnOf(refusal);
    const key = `${taskIndex}|${refusal.scheme}|${refusal.host ?? ''}|${refusal.port ?? ''}`;
    const entry = entries.get(key);
    if (entry) {
      entry.count += refusal.count;
    } else {
      entries.set(key, {
        kind: 'egress-refused',
        id: `egress-refused:${key}`,
        taskIndex,
        at: refusal.at,
        scheme: refusal.scheme,
        host: refusal.host,
        port: refusal.port,
        count: refusal.count,
      });
    }
  }

  const result = [...items];
  for (const entry of entries.values()) {
    let last = -1;
    result.forEach((item, position) => {
      if (item.taskIndex === entry.taskIndex) {
        last = position;
      }
    });
    const closesTurn =
      last >= 0 && result[last].kind === 'agent-message' ? last : last + 1;
    result.splice(closesTurn, 0, entry);
  }
  return result;
}
