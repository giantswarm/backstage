import { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';
import { formatUpdatedAgo } from '../../lib/freshness';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.palette.text.secondary,
  },
  label: {
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
}));

export interface FreshnessIndicatorProps {
  /** Epoch-ms of the most recent successful health read, or undefined while cold. */
  updatedAt?: number;
  /** Whether a (background or manual) refetch is currently in flight. */
  isRefreshing: boolean;
  /** Re-fetch the live health reads. */
  onRefresh: () => void;
}

/**
 * Shows how fresh the kubernetes-read-backed health data is ("updated Xs ago")
 * and offers a manual refresh, so a snapshot no longer flaps silently against
 * the live CRD (ADR D4). The relative label ticks on its own clock so it stays
 * honest between the provider's background refetches. Renders nothing until the
 * first successful read produces a timestamp.
 */
export function FreshnessIndicator({
  updatedAt,
  isRefreshing,
  onRefresh,
}: FreshnessIndicatorProps) {
  const classes = useStyles();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!updatedAt) {
    return null;
  }

  return (
    <Box className={classes.root}>
      <Typography variant="caption" className={classes.label}>
        {formatUpdatedAgo(updatedAt, now)}
      </Typography>
      <Tooltip title="Refresh health data">
        <span>
          <IconButton
            size="small"
            aria-label="Refresh health data"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            {isRefreshing ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <Refresh fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
