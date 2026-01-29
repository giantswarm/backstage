import {
  Box,
  Button,
  Grid,
  Link,
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
import { useState } from 'react';

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
  showDetailsLink: {
    color: theme.palette.text.primary,
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

type IncompatibilityPanelProps = {
  resourceClass: string;
  clientVersions: readonly string[];
  serverVersions: string[];
};

const IncompatibilityPanel = ({
  resourceClass,
  clientVersions,
  serverVersions,
}: IncompatibilityPanelProps) => {
  const classes = useStyles();

  const clientVersionsStr = clientVersions.join(', ');
  const serverVersionsStr =
    serverVersions.length > 0 ? serverVersions.join(', ') : 'none';

  return (
    <List dense disablePadding>
      <ListItem alignItems="flex-start" disableGutters>
        <ListItemText
          classes={{ secondary: classes.text }}
          primary="Error Type"
          secondary="API Version Incompatibility"
        />
      </ListItem>

      <ListItem alignItems="flex-start" disableGutters>
        <ListItemText
          classes={{ secondary: classes.text }}
          primary="Resource"
          secondary={resourceClass}
        />
        <CopyTextButton text={resourceClass} />
      </ListItem>

      <ListItem alignItems="flex-start" disableGutters>
        <ListItemText
          classes={{ secondary: classes.text }}
          primary="Client Supports"
          secondary={`[${clientVersionsStr}]`}
        />
        <CopyTextButton text={clientVersionsStr} />
      </ListItem>

      <ListItem alignItems="flex-start" disableGutters>
        <ListItemText
          classes={{ secondary: classes.text }}
          primary="Server Provides"
          secondary={`[${serverVersionsStr}]`}
        />
        <CopyTextButton text={serverVersionsStr} />
      </ListItem>
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

type ErrorDetailsProps = {
  errorItem: ErrorItem;
  onRetry: (errorItemId: number) => void;
  onDismiss: (errorItemId: number) => void;
};

const ErrorDetails = ({ errorItem, onRetry, onDismiss }: ErrorDetailsProps) => {
  const classes = useStyles();
  const [showDetails, setShowDetails] = useState(false);

  const handleShowDetailsClick = (event: React.MouseEvent) => {
    event.preventDefault();
    setShowDetails(!showDetails);
  };

  const isIncompatibility = errorItem.type === 'incompatibility';

  const message = errorItem.message
    ? errorItem.message
    : (errorItem.error?.message ?? 'Unknown error');

  return (
    <Box mt={1}>
      <Typography variant="body2">
        {message}
        {message.endsWith('.') ? ' ' : '. '}
        <Link
          href="#"
          className={classes.showDetailsLink}
          onClick={handleShowDetailsClick}
        >
          Show details.
        </Link>
      </Typography>

      {showDetails ? (
        <Box mb={4} className={classes.details}>
          {isIncompatibility && errorItem.incompatibility && (
            <IncompatibilityPanel
              resourceClass={errorItem.incompatibility.resourceClass}
              clientVersions={errorItem.incompatibility.clientVersions}
              serverVersions={errorItem.incompatibility.serverVersions}
            />
          )}
          {!isIncompatibility && errorItem.error && (
            <ErrorPanel
              error={errorItem.error.name}
              message={errorItem.error.message}
              stack={errorItem.error.stack}
            />
          )}
          <Box display="flex" marginTop={2} gridGap={10}>
            <Button
              size="small"
              variant="outlined"
              endIcon={<ClearIcon>dismiss</ClearIcon>}
              onClick={() => onDismiss(errorItem.id)}
            >
              Dismiss
            </Button>
            {!isIncompatibility && errorItem.retry ? (
              <Button
                size="small"
                variant="outlined"
                endIcon={<ReplayIcon>retry</ReplayIcon>}
                onClick={() => onRetry(errorItem.id)}
              >
                Retry
              </Button>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};

type ErrorsProps = {
  errors: ErrorItem[];
  onRetry: (errorItemId: number) => void;
  onDismiss: (errorItemId: number) => void;
};

export const Errors = ({ errors, onRetry, onDismiss }: ErrorsProps) => {
  const classes = useStyles();

  const groups = Object.entries(groupBy(errors, 'cluster')).sort((a, b) => {
    const aId = a[0] || '';
    const bId = b[0] || '';
    return aId.localeCompare(bId);
  });

  const clusters = groups.map(([groupId]) => groupId).filter(Boolean);
  const title = clusters.length
    ? `Errors when trying to fetch resources from ${clusters.join(', ')}.`
    : 'Something went wrong';

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display="flex" alignItems="center">
          <StyledErrorOutlineIcon />
          <Typography variant="subtitle1">{title}</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={4}>
          {groups.map(([groupId, errorItems]) => {
            const errorsWithMessage = errorItems.filter(
              ({ message }) => !!message,
            );

            const groupTitle = groupId
              ? `${groupId}:`
              : errorsWithMessage[0]?.message ||
                errorItems[0].error?.message ||
                errorItems[0].message ||
                'Unknown error';

            return (
              <Grid item key={groupId} xs={12}>
                <Box>
                  <Typography
                    variant="subtitle2"
                    component="p"
                    className={classes.stronger}
                  >
                    {groupTitle}
                  </Typography>
                  {errorItems.map(errorItem => (
                    <ErrorDetails
                      key={errorItem.id}
                      errorItem={errorItem}
                      onRetry={onRetry}
                      onDismiss={onDismiss}
                    />
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
