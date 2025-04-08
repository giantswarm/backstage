import React from 'react';
import classNames from 'classnames';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
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
import { compareDates } from '../../utils/helpers';
import { DateComponent, Heading, ScrollContainer } from '../../UI';

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
  header: {
    padding: theme.spacing(2),
    alignItems: 'start',
  },
  action: {
    margin: -theme.spacing(1),
  },
  content: {
    paddingTop: 0,
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
  const [expanded, setExpanded] = React.useState(defaultState === 'expanded');

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  let conditionHeadline = condition.type;
  if (condition.status === 'False') {
    conditionHeadline = `Not ${condition.type.toLowerCase()}`;
  }

  return (
    <Card>
      <CardHeader
        classes={{
          root: classes.header,
          action: classes.action,
        }}
        title={
          <Box display="flex" alignItems="center">
            {condition.status !== 'Unknown' &&
              (condition.status === 'True' ? (
                <StyledCheckCircleOutlinedIcon />
              ) : (
                <StyledCancelOutlinedIcon />
              ))}
            <Heading level="h3">{conditionHeadline}</Heading>
          </Box>
        }
        titleTypographyProps={{ variant: undefined }}
        subheader={
          expanded ? (
            <DateComponent value={condition.lastTransitionTime} relative />
          ) : null
        }
        subheaderTypographyProps={{
          variant: 'body2',
          color: 'textPrimary',
          hidden: !expanded,
        }}
        action={
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
        }
      />
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <CardContent className={classes.content}>
          <Grid container>
            <Grid item xs={12}>
              <Box>
                <Typography variant="subtitle2">Reason:</Typography>
                <Typography variant="body2" component="pre">
                  {condition.reason}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12}>
              <Box>
                <Typography variant="subtitle2">Message:</Typography>
                <ScrollContainer>
                  <Typography variant="body2" component="pre">
                    <code>{condition.message}</code>
                  </Typography>
                </ScrollContainer>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Collapse>
    </Card>
  );
};

type HelmReleaseDetailsStatusProps = {
  helmrelease: HelmRelease;
};

export const HelmReleaseDetailsStatusConditions = ({
  helmrelease,
}: HelmReleaseDetailsStatusProps) => {
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
    <Grid container direction="column">
      {conditions.map((condition, idx) => (
        <Grid item xs={12} key={condition.type}>
          <ConditionCard
            condition={condition}
            defaultState={
              idx === 0 && condition.status === 'False'
                ? 'expanded'
                : 'collapsed'
            }
          />
        </Grid>
      ))}
    </Grid>
  );
};
