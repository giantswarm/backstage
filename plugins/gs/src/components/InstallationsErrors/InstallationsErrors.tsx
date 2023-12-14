import React from 'react';
import { Box, Grid, Typography, withStyles } from '@material-ui/core';
import MuiAccordion from '@material-ui/core/Accordion';
import MuiAccordionSummary from '@material-ui/core/AccordionSummary';
import MuiAccordionDetails from '@material-ui/core/AccordionDetails';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import { styled } from '@material-ui/core/styles';
import { InstallationStatus } from '../useInstallationsStatuses';

const StyledErrorOutlineIcon = styled(ErrorOutlineIcon)({
  marginRight: 10
});

const Accordion = withStyles(() => ({
  root: {
    '&::before': {
      display: 'none',
    },
    borderRadius: 4,
  },
}))(MuiAccordion);

const AccordionSummary = withStyles((theme) => ({
  root: {
    backgroundColor: theme.palette.errorBackground,
    color: theme.palette.errorText,
    borderRadius: 4,
  },
}))(MuiAccordionSummary);

const AccordionDetails = withStyles((theme) => ({
  root: {
    padding: theme.spacing(2)
  },
}))(MuiAccordionDetails);

type InstallationsErrorsProps = {
  installationsStatuses: InstallationStatus[];
};

export const InstallationsErrors = ({
  installationsStatuses,
}: InstallationsErrorsProps) => {
  const errorStatuses = installationsStatuses.filter(
    (status) => status.isError
  );
  const installationNames = errorStatuses.map(
    (status) => status.installationName
  ).join(', ');

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display='flex'>
          <StyledErrorOutlineIcon />
          <Typography>Errors when trying to fetch resources from {installationNames}.</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={2} direction="column">
          {errorStatuses.map((status) => (
            <Grid item key={status.installationName}>
              <Typography variant='subtitle2' component='span'>{status.installationName}:</Typography>
              {Object.entries(status.errors).map(([key, error]) => (
                <Typography key={key} variant='body2'>{key}: {error.toString()}</Typography>
              ))}
            </Grid>
          ))}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}
