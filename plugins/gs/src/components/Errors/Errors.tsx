import React from 'react';
import {
  Box,
  Button,
  Grid,
  List,
  ListItem,
  ListItemText,
  Typography,
  withStyles,
} from '@material-ui/core';
import MuiAccordion from '@material-ui/core/Accordion';
import MuiAccordionSummary from '@material-ui/core/AccordionSummary';
import MuiAccordionDetails from '@material-ui/core/AccordionDetails';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import { makeStyles, styled } from '@material-ui/core/styles';
import ClearIcon from '@material-ui/icons/Clear';
import ReplayIcon from '@material-ui/icons/Replay';
import { ErrorItem } from './ErrorsProvider';
import { groupBy } from 'lodash';
import { CopyTextButton } from '@backstage/core-components';

const useStyles = makeStyles(theme => ({
  stronger: {
    fontWeight: 500,
  },
  details: {
    width: '100%',
    display: 'block',
    color: theme.palette.textContrast,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.border}`,
    padding: theme.spacing(2.0),
    fontFamily: 'sans-serif',
    marginTop: theme.spacing(2),
  },
  text: {
    fontFamily: 'monospace',
    whiteSpace: 'pre',
    overflowX: 'auto',
    marginRight: theme.spacing(2),
  },
}));

const StyledErrorOutlineIcon = styled(ErrorOutlineIcon)({
  marginRight: 10,
});

type ErrorPanelProps = {
  error: string;
  message: string;
  stack?: string;
  children?: React.ReactNode;
};

const ErrorPanel = ({ error, message, stack, children }: ErrorPanelProps) => {
  const classes = useStyles();

  return (
    <List dense disablePadding>
      <ListItem alignItems="flex-start" disableGutters>
        <ListItemText
          classes={{ secondary: classes.text }}
          primary="Error"
          secondary={error}
        />
        <CopyTextButton text={error} />
      </ListItem>

      <ListItem alignItems="flex-start" disableGutters>
        <ListItemText
          classes={{ secondary: classes.text }}
          primary="Message"
          secondary={message}
        />
        <CopyTextButton text={message} />
      </ListItem>

      {stack && (
        <ListItem alignItems="flex-start" disableGutters>
          <ListItemText
            classes={{ secondary: classes.text }}
            primary="Stack Trace"
            secondary={stack}
          />
          <CopyTextButton text={stack} />
        </ListItem>
      )}

      {children}
    </List>
  );
};

const Accordion = withStyles(() => ({
  root: {
    '&::before': {
      display: 'none',
    },
    borderRadius: 4,
  },
}))(MuiAccordion);

const AccordionSummary = withStyles(theme => ({
  root: {
    backgroundColor: theme.palette.errorBackground,
    color: theme.palette.errorText,
    borderRadius: 4,
  },
}))(MuiAccordionSummary);

const AccordionDetails = withStyles(theme => ({
  root: {
    padding: theme.spacing(2),
  },
}))(MuiAccordionDetails);

type ErrorsProps = {
  errors: ErrorItem[];
  onRetry: (errorItemId: number) => void;
  onDismiss: (errorItemId: number) => void;
};

export const Errors = ({ errors, onRetry, onDismiss }: ErrorsProps) => {
  const classes = useStyles();

  const queryErrors = errors.filter(({ queryKey }) => !!queryKey);
  const otherErrors = errors.filter(({ queryKey }) => !queryKey);

  const groups = [
    ...Object.entries(groupBy(queryErrors, 'queryKey')),
    ...Object.entries(groupBy(otherErrors, 'id')),
  ];

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display="flex" alignItems="center">
          <StyledErrorOutlineIcon />
          <Typography variant="subtitle2" className={classes.stronger}>
            Something went wrong
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={4} direction="column">
          {groups.map(([groupId, errorItems]) => {
            const errorsWithMessage = errorItems.filter(
              ({ message }) => !!message,
            );
            const errorsWithRetry = errorItems.filter(({ retry }) => !!retry);

            const title =
              errorsWithMessage[0]?.message || errorItems[0].error.message;
            const showRetry = errorsWithRetry.length > 0;

            return (
              <Grid item key={groupId} xs={12}>
                <Box>
                  <Typography
                    variant="subtitle2"
                    component="p"
                    className={classes.stronger}
                  >
                    {title}
                  </Typography>
                  {errorItems.map(errorItem => (
                    <Box className={classes.details}>
                      <ErrorPanel
                        error={errorItem.error.name}
                        message={errorItem.error.message}
                        stack={errorItem.error.stack}
                      />
                      <Box display="flex" marginTop={2} gridGap={10}>
                        <Button
                          size="small"
                          variant="outlined"
                          endIcon={<ClearIcon>dismiss</ClearIcon>}
                          onClick={() => onDismiss(errorItem.id)}
                        >
                          Dismiss
                        </Button>
                        {showRetry && (
                          <Button
                            size="small"
                            variant="outlined"
                            endIcon={<ReplayIcon>retry</ReplayIcon>}
                            onClick={() => onRetry(errorItem.id)}
                          >
                            Retry
                          </Button>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
};
