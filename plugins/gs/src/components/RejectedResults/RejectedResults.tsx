import React from 'react';
import { Box, Grid, Typography, withStyles } from '@material-ui/core';
import Accordion from '@material-ui/core/Accordion';
import MuiAccordionSummary from '@material-ui/core/AccordionSummary';
import MuiAccordionDetails from '@material-ui/core/AccordionDetails';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import { RejectedClustersResult } from "../useClusters";
import { styled } from '@material-ui/core/styles';

const StyledErrorOutlineIcon = styled(ErrorOutlineIcon)({
  marginRight: 10
});

const AccordionSummary = withStyles((theme) => ({
  root: {
    backgroundColor: theme.palette.errorBackground,
    color: theme.palette.errorText,
  },
}))(MuiAccordionSummary);

const AccordionDetails = withStyles((theme) => ({
  root: {
    padding: theme.spacing(2)
  }
}))(MuiAccordionDetails);

type Props = {
  results: RejectedClustersResult[];
};

export const RejectedResults = ({ results }: Props) => {
  const installationNames = results.map((result) => result.installationName).join(', ');

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display='flex'>
          <StyledErrorOutlineIcon />
          <Typography>Errors when trying to fetch clusters from {installationNames}.</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={2} direction="column">
          {results.map((result) => (
            <Grid item>
              <Typography variant='subtitle2' component='span'>{result.installationName}:</Typography>
              <Typography variant='body2'>{result.reason.toString()}</Typography>
            </Grid>
          ))}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}
