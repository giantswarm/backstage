import { makeStyles, Theme } from '@material-ui/core';
import { Stat, type Tone } from '@giantswarm/backstage-plugin-ui-react';
import type { LlmReliability } from '../../../lib/llmUsage';
import { WINDOW_DAYS } from '../../../lib/llmUsageQueries';
import {
  formatCount,
  formatPercent,
  formatSeconds,
  formatTokensPerSecond,
} from '../../../lib/formatNumbers';

const useStyles = makeStyles((theme: Theme) => ({
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2, 5),
  },
}));

/**
 * How well the gateway's model calls are going: latency, speed, errors, rate
 * limits.
 *
 * Latency is the whole model call, first byte of the request to last byte of
 * the response, so a long answer reads as a slow one. Tokens per second is
 * what separates the two: the median streamed call's generation speed. It
 * covers only the calls that streamed, which is why it sits beside the
 * quantiles rather than replacing them.
 *
 * Both an error rate and a 429 count, because they call for different actions:
 * a general error rate points at the provider or the gateway, while 429s are a
 * quota to raise or a concurrency to lower.
 */
export function ReliabilityStrip({
  reliability,
}: {
  reliability: LlmReliability;
}) {
  const classes = useStyles();

  // A tone only once there is enough traffic for a rate to mean anything: one
  // failure out of three calls is 33% and not yet a signal.
  function errorTone(): Tone | undefined {
    const { errorRatePct, totalRequests } = reliability;
    if (totalRequests < 20 || errorRatePct === undefined) {
      return undefined;
    }
    if (errorRatePct >= 5) {
      return 'error';
    }
    return errorRatePct > 0 ? 'warning' : 'ok';
  }

  const duration = (quantile: string) =>
    `Shows the ${quantile} model call duration over the last ${WINDOW_DAYS} days, from first request byte to last response byte, so a long answer reads as slow.`;

  return (
    <div className={classes.strip}>
      <Stat
        label="Call duration p50"
        value={formatSeconds(reliability.p50Seconds)}
        hint={duration('median')}
      />
      <Stat
        label="Call duration p95"
        value={formatSeconds(reliability.p95Seconds)}
        hint={duration('95th-percentile')}
      />
      <Stat
        label="Tokens per second"
        value={formatTokensPerSecond(reliability.outputTokensPerSecond)}
        hint={`Shows the median output speed of streamed calls over the last ${WINDOW_DAYS} days, from the gateway's coarse seconds-per-token buckets, so it is a rough rate. Unstreamed calls and idle time are not counted.`}
      />
      <Stat
        label="Error rate"
        value={formatPercent(reliability.errorRatePct)}
        tone={errorTone()}
        hint={`Shows the share of LLM requests answered with anything but 2xx or 3xx over the last ${WINDOW_DAYS} days.`}
      />
      <Stat
        label="Rate limited (429)"
        value={formatCount(reliability.rateLimited)}
        tone={reliability.rateLimited > 0 ? 'warning' : undefined}
        hint={`Counts requests answered 429 over the last ${WINDOW_DAYS} days by the provider or the gateway's rate limit, a sign to raise the quota or lower the concurrency. They also count in the error rate.`}
      />
    </div>
  );
}
