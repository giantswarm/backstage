import { makeStyles, Theme } from '@material-ui/core';
import { Stat, type Tone } from '@giantswarm/backstage-plugin-ui-react';
import type { LlmReliability } from '../../../lib/llmUsage';
import {
  formatCount,
  formatPercent,
  formatSeconds,
} from '../../../lib/formatNumbers';

const useStyles = makeStyles((theme: Theme) => ({
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2, 5),
  },
}));

/**
 * How well the gateway's model calls are going: latency, errors, rate limits.
 *
 * Latency is the whole model call, first byte of the request to last byte of
 * the response — not time to first token, which the gateway only emits for a
 * streamed response and a kagent agent turn never is.
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

  return (
    <div className={classes.strip}>
      <Stat
        label="Call duration p50"
        value={formatSeconds(reliability.p50Seconds)}
      />
      <Stat
        label="Call duration p95"
        value={formatSeconds(reliability.p95Seconds)}
      />
      <Stat
        label="Error rate"
        value={formatPercent(reliability.errorRatePct)}
        tone={errorTone()}
      />
      <Stat
        label="Rate limited (429)"
        value={formatCount(reliability.rateLimited)}
        tone={reliability.rateLimited > 0 ? 'warning' : undefined}
      />
    </div>
  );
}
