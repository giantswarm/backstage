import { useMemo } from 'react';
import { useMimirRangeQuery } from '@giantswarm/backstage-plugin-gs';
import {
  EgressRefusal,
  egressRefusalsQuery,
  readEgressRefusals,
  sessionActor,
} from '../lib/egressRefusals';

/** Refusals are counted on a scrape; reading more often shows nothing new. */
const STEP_SECONDS = 30;
/** Enough points to place a refusal on its turn; a long session gets coarser steps. */
const MAX_POINTS = 1000;
/** The window of a session kagent gave no start for. */
const UNKNOWN_START_SECONDS = 24 * 3600;

const NONE: EgressRefusal[] = [];

/**
 * The egress refusals of one Session, read from the installation's metrics as
 * the signed-in person. The Session itself is kagent's to show or refuse: the
 * page asks for this only for a Session kagent let the person read, and only
 * for that Session's actor, so a Session without refusals shows none and
 * nobody else's are asked for.
 *
 * An installation without metrics shows no refusals and keeps the page.
 */
export function useSessionEgressRefusals(options: {
  installation: string;
  sessionId: string;
  /** The agent's namespace, the actor's atespace; unknown until the agent is joined. */
  agentNamespace?: string;
  /** RFC3339. */
  createdAt?: string;
}): EgressRefusal[] {
  const { installation, sessionId, agentNamespace, createdAt } = options;

  const query = agentNamespace
    ? egressRefusalsQuery(sessionActor(sessionId, agentNamespace))
    : '';

  // Snapped to the step, so the window re-keys once a step and not per render.
  const nowStep = Math.floor(Date.now() / 1000 / STEP_SECONDS) * STEP_SECONDS;
  const created = createdAt ? Date.parse(createdAt) / 1000 : NaN;
  const start = Number.isFinite(created)
    ? Math.floor(created / STEP_SECONDS) * STEP_SECONDS - STEP_SECONDS
    : nowStep - UNKNOWN_START_SECONDS;
  // Ahead of the clock, so each refetch of the same window still covers the
  // samples scraped since: a point past the newest sample repeats it.
  const end = nowStep + 20 * STEP_SECONDS;
  const step = Math.max(
    STEP_SECONDS,
    Math.ceil((end - start) / MAX_POINTS / STEP_SECONDS) * STEP_SECONDS,
  );

  const { data } = useMimirRangeQuery({
    installationName: installation,
    query,
    start: String(start),
    end: String(end),
    step: String(step),
    enabled: Boolean(query),
    // A refusal reaches the metrics a scrape after it happened, so the page
    // keeps reading while it is open, a finished turn included.
    refetchInterval: STEP_SECONDS * 1000,
    keepPreviousAnswer: true,
  });

  return useMemo(
    () => (data?.data?.result ? readEgressRefusals(data.data.result) : NONE),
    [data],
  );
}
