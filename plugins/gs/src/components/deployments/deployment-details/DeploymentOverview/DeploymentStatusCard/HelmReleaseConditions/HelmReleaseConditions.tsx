import { useState } from 'react';
import classNames from 'classnames';
import {
  Box,
  Collapse,
  Grid,
  IconButton,
  Paper,
  Typography,
  makeStyles,
  styled,
} from '@material-ui/core';
import CancelOutlinedIcon from '@material-ui/icons/CancelOutlined';
import CheckCircleOutlinedIcon from '@material-ui/icons/CheckCircleOutlined';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { compareDates } from '../../../../../utils/helpers';
import {
  DateComponent,
  Heading,
  ScrollContainer,
  StatusMessage,
} from '../../../../../UI';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  AIChatButton,
  buildExplainErrorMessage,
} from '@giantswarm/backstage-plugin-ai-chat-react';
import { WorkloadReplicaStatus } from '../../../../../hooks/useMimirWorkloadStatus';
import { WorkloadStatusSummary } from '../WorkloadStatusSummary';

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
}));

type Condition = {
  lastTransitionTime: string;
  message: string;
  reason: string;
  status: 'True' | 'False' | 'Unknown';
  type: string;
};

// Most condition types report failure as status False, but 'Stalled' is an
// abnormal-true condition: Stalled with status True means the release is
// stuck, while Stalled with status False is healthy.
function isFailingCondition(condition: Condition): boolean {
  if (condition.type === 'Stalled') {
    return condition.status === 'True';
  }

  return condition.status === 'False';
}

type ConditionCardProps = {
  helmrelease: HelmRelease;
  condition: Condition;
  defaultState?: 'expanded' | 'collapsed';
};

const ConditionCard = ({
  helmrelease,
  condition,
  defaultState = 'collapsed',
}: ConditionCardProps) => {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(defaultState === 'expanded');

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  let conditionHeadline = `HelmRelease ${condition.type}`;
  if (condition.status === 'False') {
    conditionHeadline = `HelmRelease Not ${condition.type.toLowerCase()}`;
  }

  const isFailing = isFailingCondition(condition);

  return (
    <Box>
      <Box display="flex" flexDirection="column">
        <Box display="flex" alignItems="center">
          {condition.status !== 'Unknown' &&
            (isFailing ? (
              <StyledCancelOutlinedIcon />
            ) : (
              <StyledCheckCircleOutlinedIcon />
            ))}
          <Heading level="h3">{conditionHeadline}</Heading>
          <Box className={classes.action}>
            <IconButton
              className={classNames(classes.expand, {
                [classes.expandOpen]: expanded,
              })}
              onClick={handleExpandClick}
              aria-expanded={expanded}
              aria-label="Show condition details"
            >
              <ExpandMoreIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Grid container>
          <Grid item xs={12}>
            <Typography variant="body2">
              <DateComponent value={condition.lastTransitionTime} relative />
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <Box>
              <Typography variant="subtitle2">Reason:</Typography>
              <StatusMessage>{condition.reason}</StatusMessage>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Box>
              <Typography variant="subtitle2">Message:</Typography>
              <ScrollContainer>
                <StatusMessage>
                  <code>{condition.message}</code>
                </StatusMessage>
              </ScrollContainer>
            </Box>
          </Grid>
          {isFailing && condition.message && (
            <Grid item xs={12}>
              <Box mt={1}>
                <AIChatButton
                  troubleshoot
                  label="Explain this error"
                  items={[
                    {
                      message: buildExplainErrorMessage({
                        kind: 'HelmRelease',
                        name: helmrelease.getName(),
                        namespace: helmrelease.getNamespace(),
                        cluster: helmrelease.cluster,
                        message: condition.message,
                        reason: condition.reason,
                        revision: helmrelease.getLastAttemptedRevision(),
                      }),
                    },
                  ]}
                />
              </Box>
            </Grid>
          )}
        </Grid>
      </Collapse>
    </Box>
  );
};

type HelmReleaseConditionsProps = {
  helmrelease: HelmRelease;
  workloads?: WorkloadReplicaStatus[];
  workloadsLoading?: boolean;
  workloadsEnabled?: boolean;
  workloadsError?: Error | null;
  workloadsLabelSelector?: string;
};

export const HelmReleaseConditions = ({
  helmrelease,
  workloads,
  workloadsLoading = false,
  workloadsEnabled = true,
  workloadsError = null,
  workloadsLabelSelector,
}: HelmReleaseConditionsProps) => {
  const conditions = helmrelease.getStatusConditions();
  if (!conditions) {
    return (
      <Paper>
        <Box padding={2}>
          <Heading level="h3">No status information available</Heading>
        </Box>
      </Paper>
    );
  }

  const sortedConditions = conditions.sort((a, b) =>
    compareDates(b.lastTransitionTime, a.lastTransitionTime),
  );

  return (
    <InfoCard title="Conditions">
      <Grid container direction="column">
        {sortedConditions.map((condition, idx) => (
          <Grid item xs={12} key={condition.type}>
            <ConditionCard
              helmrelease={helmrelease}
              condition={condition}
              defaultState={
                idx === 0 && isFailingCondition(condition)
                  ? 'expanded'
                  : 'collapsed'
              }
            />
          </Grid>
        ))}
        <Grid item xs={12}>
          <WorkloadStatusSummary
            workloads={workloads ?? []}
            workloadsLoading={workloadsLoading}
            workloadsEnabled={workloadsEnabled}
            workloadsError={workloadsError}
            workloadsLabelSelector={workloadsLabelSelector}
          />
        </Grid>
      </Grid>
    </InfoCard>
  );
};
