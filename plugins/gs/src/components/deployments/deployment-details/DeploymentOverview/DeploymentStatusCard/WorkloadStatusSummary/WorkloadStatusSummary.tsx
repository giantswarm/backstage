import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import {
  Box,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  makeStyles,
  styled,
} from '@material-ui/core';
import CancelOutlinedIcon from '@material-ui/icons/CancelOutlined';
import CheckCircleOutlinedIcon from '@material-ui/icons/CheckCircleOutlined';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import { Heading } from '../../../../../UI';
import { WorkloadReplicaStatus } from '../../../../../hooks/useMimirWorkloadStatus';

const StyledCancelOutlinedIcon = styled(CancelOutlinedIcon)(({ theme }) => ({
  marginRight: 10,
  color: theme.palette.status.error,
}));

const StyledCheckCircleOutlinedIcon = styled(CheckCircleOutlinedIcon)(
  ({ theme }) => ({
    marginRight: 10,
    color: theme.palette.status.ok,
  }),
);

const StyledHelpOutlineIcon = styled(HelpOutlineIcon)(({ theme }) => ({
  marginRight: 10,
  color: theme.palette.text.disabled,
}));

const SmallCancelIcon = styled(CancelOutlinedIcon)(({ theme }) => ({
  color: theme.palette.status.error,
  fontSize: '1rem',
  verticalAlign: 'text-bottom',
}));

const SmallCheckIcon = styled(CheckCircleOutlinedIcon)(({ theme }) => ({
  color: theme.palette.status.ok,
  fontSize: '1rem',
  verticalAlign: 'text-bottom',
}));

const useStyles = makeStyles(theme => ({
  action: {
    margin: -theme.spacing(1),
    marginLeft: 'auto',
  },
  expand: {
    transform: 'rotate(0deg)',
    marginLeft: 'auto',
    transition: theme.transitions.create('transform', {
      duration: theme.transitions.duration.shortest,
    }),
  },
  expandOpen: {
    transform: 'rotate(180deg)',
  },
  table: {
    marginTop: theme.spacing(1.5),
    '& th': {
      padding: theme.spacing(0.5, 1),
      borderBottom: 'none',
      fontWeight: theme.typography.fontWeightBold,
    },
    '& td': {
      padding: theme.spacing(0.5, 1),
      borderBottom: 'none',
    },
  },
}));

function isWorkloadReady(w: WorkloadReplicaStatus): boolean {
  return w.readyReplicas >= w.desiredReplicas && w.desiredReplicas > 0;
}

type WorkloadStatusSummaryProps = {
  workloads: WorkloadReplicaStatus[];
  workloadsLoading: boolean;
  workloadsEnabled: boolean;
  workloadsError: Error | null;
  workloadsLabelSelector?: string;
};

export const WorkloadStatusSummary = ({
  workloads,
  workloadsLoading,
  workloadsEnabled,
  workloadsError,
  workloadsLabelSelector,
}: WorkloadStatusSummaryProps) => {
  const classes = useStyles();

  const hasData = workloads.length > 0;
  const allReady = hasData && workloads.every(isWorkloadReady);
  const notReadyCount = hasData
    ? workloads.filter(w => !isWorkloadReady(w)).length
    : 0;
  const isUnavailable = !hasData && !workloadsLoading;
  const shouldAutoExpand = hasData ? !allReady : isUnavailable;

  const [expanded, setExpanded] = useState(false);
  const hasResolved = useRef(false);

  useEffect(() => {
    if (workloadsLoading || hasResolved.current) return;
    hasResolved.current = true;
    setExpanded(shouldAutoExpand);
  }, [workloadsLoading, shouldAutoExpand]);

  let headline: string;
  let icon: React.ReactElement;

  if (workloadsLoading) {
    headline = 'Workloads (loading\u2026)';
    icon = <StyledHelpOutlineIcon />;
  } else if (!workloadsEnabled) {
    headline = 'Workloads (unavailable)';
    icon = <StyledHelpOutlineIcon />;
  } else if (workloadsError) {
    headline = 'Workloads (error)';
    icon = <StyledHelpOutlineIcon />;
  } else if (!hasData) {
    headline = 'Workloads (no data)';
    icon = <StyledHelpOutlineIcon />;
  } else if (allReady) {
    headline = `Workloads (${workloads.length}/${workloads.length} ready)`;
    icon = <StyledCheckCircleOutlinedIcon />;
  } else {
    headline = `Workloads (${notReadyCount} not ready)`;
    icon = <StyledCancelOutlinedIcon />;
  }

  let diagnosticContent: React.ReactNode | undefined;
  if (!workloadsEnabled) {
    diagnosticContent =
      'Cannot determine target cluster for this deployment. Workload metrics are not available.';
  } else if (workloadsError) {
    diagnosticContent = `Failed to query metrics: ${workloadsError.message}`;
  } else if (!hasData && !workloadsLoading) {
    diagnosticContent = workloadsLabelSelector ? (
      <>
        No workload metrics found for{' '}
        <code>{`{${workloadsLabelSelector}}`}</code>. The workload may not be
        running, or metrics may not be available for this cluster.
      </>
    ) : (
      'No workload metrics found. The workload may not be running, or metrics may not be available for this cluster.'
    );
  }

  return (
    <Box>
      <Box display="flex" flexDirection="column">
        <Box display="flex" alignItems="center">
          {icon}
          <Heading level="h3">{headline}</Heading>
          <Box className={classes.action}>
            <IconButton
              className={classNames(classes.expand, {
                [classes.expandOpen]: expanded,
              })}
              onClick={() => setExpanded(prev => !prev)}
              aria-expanded={expanded}
              aria-label="Show workload details"
            >
              <ExpandMoreIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        {diagnosticContent ? (
          <Box mt={1.5}>
            <Typography variant="body2" color="textSecondary">
              {diagnosticContent}
            </Typography>
          </Box>
        ) : (
          <Table size="small" className={classes.table}>
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Kind</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right">Ready</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {workloads.map(w => (
                <TableRow key={`${w.kind}-${w.name}`}>
                  <TableCell padding="none" style={{ width: 24 }}>
                    {isWorkloadReady(w) ? (
                      <SmallCheckIcon />
                    ) : (
                      <SmallCancelIcon />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{w.kind}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{w.name}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {w.readyReplicas}/{w.desiredReplicas}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Collapse>
    </Box>
  );
};
