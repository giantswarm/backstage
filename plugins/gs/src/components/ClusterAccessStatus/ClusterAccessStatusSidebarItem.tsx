import { MouseEvent, useEffect, useMemo, useState } from 'react';
import { SidebarItem } from '@backstage/core-components';
import { useApi, errorApiRef } from '@backstage/core-plugin-api';
import {
  Box,
  Button,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
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
  healthy: '#2e7d32',
  degraded: '#f9a825',
  'session-expired': '#c62828',
};

const STATE_LABELS: Record<ClusterAccessState, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  'session-expired': 'Session expired',
};

const useStyles = makeStyles(theme => ({
  popover: {
    width: 340,
    maxWidth: '90vw',
  },
  header: {
    padding: theme.spacing(2, 2, 1, 2),
  },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    fontSize: 11,
  },
  actions: {
    padding: theme.spacing(1, 2, 2, 2),
  },
}));

/**
 * Computes the worst (most actionable) state across all tracked clusters.
 * session-expired wins over degraded wins over healthy, because an expired
 * main session is the one thing the user can immediately fix.
 */
function overallState(
  entries: ClusterAccessStatusEntry[],
): ClusterAccessState {
  if (entries.some(e => e.state === 'session-expired')) {
    return 'session-expired';
  }
  if (entries.some(e => e.state === 'degraded')) {
    return 'degraded';
  }
  return 'healthy';
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
          <Typography variant="body2" color="textSecondary">
            {STATE_LABELS[state]}
          </Typography>
        </div>
        <Divider />
        <List dense>
          {entries.map(entry => (
            <ListItem key={entry.installation}>
              <ListItemIcon style={{ minWidth: 32 }}>
                <StatusDot color={STATE_COLORS[entry.state]} />
              </ListItemIcon>
              <ListItemText
                primary={entry.installation}
                secondary={entry.reason ?? STATE_LABELS[entry.state]}
              />
            </ListItem>
          ))}
        </List>
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
