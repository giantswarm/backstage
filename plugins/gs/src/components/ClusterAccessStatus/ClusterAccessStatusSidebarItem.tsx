import { MouseEvent, useMemo, useState } from 'react';
import { SidebarItem, useSidebarPinState } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { Switch } from '@backstage/ui';
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
  CLUSTER_ACCESS_OFF_LABEL,
  CLUSTER_ACCESS_STATE_LABELS,
  CLUSTER_ACCESS_STATE_ORDER,
  CLUSTER_ACCESS_STATE_TONES,
  CLUSTER_ACCESS_SUMMARY_LABELS,
  ClusterAccessState,
  ClusterAccessStatusEntry,
  ClusterAccessTone,
  showsAccessReason,
  useClusterAccessStatus,
  useSignInAgain,
} from '../../apis/clusterAccessStatus';
import {
  mutedInstallationsApiRef,
  useMutedInstallations,
} from '../../apis/mutedInstallations';

// The classic widget's hex for each shared tone (MUI icons take a colour).
const TONE_COLORS: Record<ClusterAccessTone, string> = {
  neutral: '#9e9e9e',
  success: '#2e7d32',
  warning: '#f9a825',
  danger: '#c62828',
};

const stateColor = (state: ClusterAccessState) =>
  TONE_COLORS[CLUSTER_ACCESS_STATE_TONES[state]];

// A muted installation is switched off app-wide: not probed, not fetched. Shown
// greyed with an "Off" caption and its toggle in the off position.
const MUTED_COLOR = '#bdbdbd';

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
    padding: theme.spacing(0.5, 1, 0.5, 2),
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
  toggle: {
    // Right-align the switch even when a row has no reason caption to fill the
    // gap.
    marginLeft: 'auto',
  },
  actions: {
    padding: theme.spacing(1, 2, 2, 2),
  },
}));

/**
 * Computes the worst (most actionable) state across all tracked clusters, using
 * the shared {@link CLUSTER_ACCESS_STATE_ORDER} severity ranking: session-expired wins over
 * degraded, because an expired main session is the one thing the user can
 * immediately fix; `connecting` ranks above plain healthy so the badge reflects
 * in-flight probes on startup, but below any real problem. No entries → healthy.
 */
function overallState(entries: ClusterAccessStatusEntry[]): ClusterAccessState {
  return (
    CLUSTER_ACCESS_STATE_ORDER.find(state =>
      entries.some(e => e.state === state),
    ) ?? 'healthy'
  );
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

  return CLUSTER_ACCESS_STATE_ORDER.filter(state => counts[state] > 0).map(
    state => ({
      key: state,
      label: `${counts[state]} ${CLUSTER_ACCESS_SUMMARY_LABELS[state]}`,
      muted: state === 'healthy',
    }),
  );
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
  const mutedApi = useApi(mutedInstallationsApiRef);
  const signInAgain = useSignInAgain();
  // In the mobile sidebar the item is a full-width row in the Menu overlay, so
  // the popover opens above it instead of to its right.
  const { isMobile } = useSidebarPinState();

  const entries = useClusterAccessStatus();
  const muted = useMutedInstallations();
  const [anchorEl, setAnchorEl] = useState<Element | null>(null);

  const state = useMemo(() => overallState(entries), [entries]);
  // `summarize`/`overallState` only know about *probed* entries. With no live
  // entries but some muted installations, they'd report a green "All 0 healthy" —
  // the opposite of reality — so drive the badge and summary off the muted set in
  // that case (the muted count is appended to the summary in render).
  const summary = useMemo(
    () => (entries.length > 0 ? summarize(entries) : []),
    [entries],
  );
  const sessionExpired = state === 'session-expired';
  const badgeColor = entries.length === 0 ? MUTED_COLOR : stateColor(state);

  // One row per accessed *or* muted installation, sorted by name. A muted
  // installation isn't probed (so it has no status entry) but is still listed so
  // it can be switched back on.
  const rows = useMemo(() => {
    const mutedSet = new Set(muted);
    const entryByInstallation = new Map(
      entries.map(entry => [entry.installation, entry]),
    );
    const installations = Array.from(
      new Set([...entryByInstallation.keys(), ...muted]),
    ).sort((a, b) => a.localeCompare(b));

    return installations.map(installation => {
      if (mutedSet.has(installation)) {
        return {
          installation,
          dotColor: MUTED_COLOR,
          caption: CLUSTER_ACCESS_OFF_LABEL,
          enabled: false,
        };
      }
      const entry = entryByInstallation.get(installation)!;
      const caption = showsAccessReason(entry.state)
        ? (entry.reason ?? CLUSTER_ACCESS_STATE_LABELS[entry.state])
        : undefined;
      return {
        installation,
        dotColor: stateColor(entry.state),
        caption,
        enabled: true,
      };
    });
  }, [entries, muted]);

  // Nothing accessed and nothing muted -- keep the sidebar uncluttered.
  if (entries.length === 0 && muted.length === 0) {
    return null;
  }

  const icon = () => (
    <Box position="relative" display="flex">
      <CloudIcon />
      <FiberManualRecordIcon
        className={classes.badge}
        style={{ color: badgeColor }}
      />
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
        anchorOrigin={
          isMobile
            ? { vertical: 'top', horizontal: 'center' }
            : { vertical: 'center', horizontal: 'right' }
        }
        transformOrigin={
          isMobile
            ? { vertical: 'bottom', horizontal: 'center' }
            : { vertical: 'center', horizontal: 'left' }
        }
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
                    part.muted ? undefined : { color: stateColor(part.key) }
                  }
                >
                  {part.label}
                </span>
              </span>
            ))}
            {muted.length > 0 && (
              <span>
                {summary.length > 0 && ' · '}
                {muted.length} off
              </span>
            )}
          </Typography>
        </div>
        <Divider />
        <div className={classes.list}>
          {rows.map(({ installation, dotColor, caption, enabled }) => (
            <div key={installation} className={classes.row}>
              <StatusDot color={dotColor} />
              <Typography variant="body2" noWrap className={classes.name}>
                {installation}
              </Typography>
              {caption && (
                <Typography
                  variant="caption"
                  color="textSecondary"
                  className={classes.reason}
                  title={caption}
                >
                  {caption}
                </Typography>
              )}
              <Switch
                className={classes.toggle}
                aria-label={`Enable installation ${installation}`}
                isSelected={enabled}
                onChange={isSelected =>
                  mutedApi.setMuted(installation, !isSelected)
                }
              />
            </div>
          ))}
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
                  signInAgain();
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
