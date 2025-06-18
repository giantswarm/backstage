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
import type { HelmRelease } from '@giantswarm/backstage-plugin-gs-common';
import { compareDates } from '../../../../../utils/helpers';
import {
  DateComponent,
  Heading,
  ScrollContainer,
  StatusMessage,
} from '../../../../../UI';
import { InfoCard } from '@backstage/core-components';

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

type ConditionCardProps = {
  condition: {
    lastTransitionTime: string;
    message: string;
    reason: string;
    status: 'True' | 'False' | 'Unknown';
    type: string;
  };
  defaultState?: 'expanded' | 'collapsed';
};

const ConditionCard = ({
  condition,
  defaultState = 'collapsed',
}: ConditionCardProps) => {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(defaultState === 'expanded');

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  let conditionHeadline = condition.type;
  if (condition.status === 'False') {
    conditionHeadline = `Not ${condition.type.toLowerCase()}`;
  }

  return (
    <Box>
      <Box display="flex" flexDirection="column">
        <Box display="flex" alignItems="center">
          {condition.status !== 'Unknown' &&
            (condition.status === 'False' || condition.type === 'Stalled' ? (
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
        </Grid>
      </Collapse>
    </Box>
  );
};

type HelmReleaseConditionsProps = {
  helmrelease: HelmRelease;
};

export const HelmReleaseConditions = ({
  helmrelease,
}: HelmReleaseConditionsProps) => {
  if (!helmrelease.status?.conditions) {
    return (
      <Paper>
        <Box padding={2}>
          <Heading level="h3">No status information available</Heading>
        </Box>
      </Paper>
    );
  }

  const conditions = helmrelease.status.conditions.sort((a, b) =>
    compareDates(b.lastTransitionTime, a.lastTransitionTime),
  );

  return (
    <InfoCard title="Conditions">
      <Grid container direction="column">
        {conditions.map((condition, idx) => (
          <Grid item xs={12} key={condition.type}>
            <ConditionCard
              condition={condition}
              defaultState={
                idx === 0 &&
                (condition.status === 'False' || condition.type === 'Stalled')
                  ? 'expanded'
                  : 'collapsed'
              }
            />
          </Grid>
        ))}
      </Grid>
    </InfoCard>
  );
};
