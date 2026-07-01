import { MouseEvent, useEffect, useMemo, useState } from 'react';
import { SidebarItem } from '@backstage/core-components';
import { useApi, errorApiRef } from '@backstage/core-plugin-api';
import {
  Box,
  Button,
  Divider,
  Popover,
  Typography,
  makeStyles,
} from '@material-ui/core';
import CloudIcon from '@material-ui/icons/CloudQueue';
import FiberManualRecordIcon from '@material-ui/icons/FiberManualRecord';
import {
  ClusterAccessState,
  ClusterAccessStatusEntry,
  clusterAccessStatusApiRef,
} from '../../apis/clusterAccessStatus';
import { gsAuthApiRef } from '../../apis/auth/types';

const STATE_COLORS: Record<ClusterAccessState, string> = {
  connecting: '#9e9e9e',
  healthy: '#2e7d32',
  degraded: '#f9a825',
  'session-expired': '#c62828',
};

const STATE_LABELS: Record<ClusterAccessState, string> = {
  connecting: 'Connecting…',
  healthy: 'Healthy',
  degraded: 'Degraded',
  'session-expired': 'Session expired',
};

// Lowercase wording used in the header count summary ("1 degraded · 4 healthy").
const SUMMARY_LABELS: Record<ClusterAccessState, string> = {
  connecting: 'connecting',
  healthy: 'healthy',
  degraded: 'degraded',
  'session-expired': 'session expired',
};

// Severity order shared by the summary and the row list -- worst first.
const STATE_ORDER: ClusterAccessState[] = [
  'session-expired',
  'degraded',
  'connecting',
  'healthy',
];

const useStyles = makeStyles(theme => ({
  popover: {
    width: 340,
    maxWidth: '90vw',
  },
  header: {
    padding: theme.spacing(1.5, 2, 1, 2),
  },
  summary: {
    marginTop: theme.spacing(0.25),
  },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    fontSize: 11,
  },
  list: {
    padding: theme.spacing(0.5, 0),
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 2),
  },
  name: {
    flexShrink: 0,
  },
  reason: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    // The caption is a smaller font than the name; nudge it down so its
    // baseline lines up with the installation name instead of sitting high.
    position: 'relative',
    top: 2,
  },
  actions: {
    padding: theme.spacing(1, 2, 2, 2),
  },
}));

/**
 * Computes the worst (most actionable) state across all tracked clusters.
 * session-expired wins over degraded, because an expired main session is the
 * one thing the user can immediately fix. `connecting` ranks above plain
 * healthy so the badge reflects in-flight probes on startup, but below any
 * real problem.
 */
function overallState(entries: ClusterAccessStatusEntry[]): ClusterAccessState {
  if (entries.some(e => e.state === 'session-expired')) {
    return 'session-expired';
  }
  if (entries.some(e => e.state === 'degraded')) {
    return 'degraded';
  }
  if (entries.some(e => e.state === 'connecting')) {
    return 'connecting';
  }
  return 'healthy';
}

type SummaryPart = { key: ClusterAccessState; label: string; muted: boolean };

/**
 * Compact, problem-first count of states for the header. Collapses to a single
 * "All N healthy" part when nothing needs attention; otherwise lists each
 * non-empty state worst-first ("1 degraded · 4 healthy").
 */
export function summarize(entries: ClusterAccessStatusEntry[]): SummaryPart[] {
  const counts: Record<ClusterAccessState, number> = {
    'session-expired': 0,
    degraded: 0,
    connecting: 0,
    healthy: 0,
  };
  for (const entry of entries) {
    counts[entry.state]++;
  }

  const total = entries.length;
  if (counts.healthy === total) {
    return [{ key: 'healthy', label: `All ${total} healthy`, muted: true }];
  }

  return STATE_ORDER.filter(state => counts[state] > 0).map(state => ({
    key: state,
    label: `${counts[state]} ${SUMMARY_LABELS[state]}`,
    muted: state === 'healthy',
  }));
}

function StatusDot({ color }: { color: string }) {
  return <FiberManualRecordIcon style={{ color }} fontSize="small" />;
}

/**
 * Persistent sidebar element showing per-cluster access health. A colored badge
 * opens a popover listing every accessed cluster, its state and a
 * human-readable reason, plus a "Sign in again" action when the main session
 * has expired -- inspired by connection-status menus (Tailscale, Docker
 * Desktop, Linear). Broker-backed clusters never pop up a per-cluster login, so
 * this is where failures become visible.
 */
export function ClusterAccessStatusSidebarItem() {
  const classes = useStyles();
  const statusApi = useApi(clusterAccessStatusApiRef);
  const mainAuthApi = useApi(gsAuthApiRef);
  const errorApi = useApi(errorApiRef);

  const [entries, setEntries] = useState<ClusterAccessStatusEntry[]>(
    statusApi.getSnapshot(),
  );
  const [anchorEl, setAnchorEl] = useState<Element | null>(null);

  useEffect(() => {
    const subscription = statusApi.status$().subscribe(setEntries);
    return () => subscription.unsubscribe();
  }, [statusApi]);

  const state = useMemo(() => overallState(entries), [entries]);
  const summary = useMemo(() => summarize(entries), [entries]);
  const sessionExpired = state === 'session-expired';
  const color = STATE_COLORS[state];

  // Nothing has been accessed yet -- keep the sidebar uncluttered.
  if (entries.length === 0) {
    return null;
  }

  const icon = () => (
    <Box position="relative" display="flex">
      <CloudIcon />
      <FiberManualRecordIcon className={classes.badge} style={{ color }} />
    </Box>
  );

  return (
    <>
      <SidebarItem
        icon={icon}
        text="Cluster access"
        onClick={(event: MouseEvent<Element>) =>
          setAnchorEl(event.currentTarget)
        }
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        classes={{ paper: classes.popover }}
      >
        <div className={classes.header}>
          <Typography variant="subtitle1">Cluster access</Typography>
          <Typography
            variant="body2"
            color="textSecondary"
            className={classes.summary}
          >
            {summary.map((part, index) => (
              <span key={part.key}>
                {index > 0 && ' · '}
                <span
                  style={
                    part.muted ? undefined : { color: STATE_COLORS[part.key] }
                  }
                >
                  {part.label}
                </span>
              </span>
            ))}
          </Typography>
        </div>
        <Divider />
        <div className={classes.list}>
          {entries.map(entry => {
            const reason =
              entry.state === 'degraded' || entry.state === 'session-expired'
                ? (entry.reason ?? STATE_LABELS[entry.state])
                : undefined;
            return (
              <div key={entry.installation} className={classes.row}>
                <StatusDot color={STATE_COLORS[entry.state]} />
                <Typography variant="body2" noWrap className={classes.name}>
                  {entry.installation}
                </Typography>
                {reason && (
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    className={classes.reason}
                    title={reason}
                  >
                    {reason}
                  </Typography>
                )}
              </div>
            );
          })}
        </div>
        {sessionExpired && (
          <>
            <Divider />
            <div className={classes.actions}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={() => {
                  setAnchorEl(null);
                  mainAuthApi.signIn().catch(error => errorApi.post(error));
                }}
              >
                Sign in again
              </Button>
            </div>
          </>
        )}
      </Popover>
    </>
  );
}
