import { Button, Grid, Link, Typography } from '@material-ui/core';

import type { BotPrRow } from '../../lib/marge';

function Fact({
  label,
  value,
  title,
}: {
  label: string;
  value?: string | number;
  title?: string;
}) {
  if (value === undefined || value === '') {
    return null;
  }
  return (
    <Grid item xs={6} md={3}>
      <Typography variant="caption" color="textSecondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" title={title}>
        {value}
      </Typography>
    </Grid>
  );
}

const date = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

export type BotPrDetailsProps = {
  row: BotPrRow;
  /** Whether the read behind the row was live: the stored read leaves half the record empty. */
  isLive: boolean;
  /** Whether the person's session reaches marge, so the actions are offered. */
  canAct: boolean;
  onSweep: (row: BotPrRow) => void;
  onMarkBlocked: (row: BotPrRow) => void;
};

/**
 * The expanded row: everything the engine reported for the PR -- the state
 * and its evidence, the label it carries, the bot and the update, the policy
 * it was decided under and the prior rescue marker -- and the two actions the
 * page offers on one PR. The stored read carries only the label; a live read
 * fills the rest, and the record says so instead of showing blanks as facts.
 */
export function BotPrDetails({
  row,
  isLive,
  canAct,
  onSweep,
  onMarkBlocked,
}: BotPrDetailsProps) {
  const policy = row.policy;
  const rescue = row.rescue;
  let rescueState: string | undefined;
  if (rescue) {
    rescueState = 'still stands';
    if (rescue.stale) {
      rescueState = 'stale: the PR changed since';
    } else if (rescue.rebased) {
      rescueState = 'still stands, rebased since';
    }
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant="body2">
          <Link href={row.url} target="_blank" rel="noopener noreferrer">
            {row.ref}
          </Link>{' '}
          {row.title}
        </Typography>
      </Grid>
      <Fact label="Classification" value={row.status} />
      <Fact label="Evidence" value={row.detail} />
      <Fact label="Label" value={row.label ?? 'none'} />
      <Fact label="Bot" value={row.kind} />
      <Fact
        label="Update"
        value={
          row.update_type ?? (isLive ? 'unknown' : 'stored read: not read')
        }
      />
      <Fact label="Opened" value={date(row.created_at)} />
      {row.reason ? <Fact label="Obsolete because" value={row.reason} /> : null}
      {policy ? (
        <>
          <Fact
            label="Policy"
            value={policy.sweep ? 'sweep on' : 'sweep off for this repository'}
            title={policy.sources?.join('\n')}
          />
          <Fact
            label="Merges when green"
            value={
              row.kind && policy.update_types[row.kind]
                ? policy.update_types[row.kind].join(', ')
                : 'nothing for this bot'
            }
          />
          <Fact
            label="Confirm"
            value={policy.rescue.confirm ?? 'per-pr'}
            title="who confirms before the engine acts, from the team policy"
          />
          <Fact
            label="Policy files"
            value={policy.sources?.length ?? 0}
            title={policy.sources?.join('\n')}
          />
        </>
      ) : (
        <Grid item xs={12}>
          <Typography variant="caption" color="textSecondary">
            {isLive
              ? 'The engine reported no policy for this PR.'
              : 'The stored read carries the label only. Refresh classification reads the update type, the policy and the rescue marker.'}
          </Typography>
        </Grid>
      )}
      {rescue ? (
        <>
          <Fact label="Rescue outcome" value={rescue.outcome} />
          <Fact label="Rescue by" value={rescue.tool} />
          <Fact label="Rescue on" value={date(rescue.at)} />
          <Fact
            label="Rescue marker"
            value={rescueState}
            title={rescue.reason}
          />
        </>
      ) : null}
      {canAct ? (
        <Grid item xs={12}>
          <Grid container spacing={1}>
            <Grid item>
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={() => onSweep(row)}
              >
                Sweep this PR…
              </Button>
            </Grid>
            <Grid item>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onMarkBlocked(row)}
              >
                Mark blocked…
              </Button>
            </Grid>
          </Grid>
        </Grid>
      ) : null}
    </Grid>
  );
}
