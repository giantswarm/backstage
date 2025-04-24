import MuiAccordion from '@material-ui/core/Accordion';
import MuiAccordionSummary from '@material-ui/core/AccordionSummary';
import MuiAccordionDetails from '@material-ui/core/AccordionDetails';
import ArrowRightIcon from '@material-ui/icons/ArrowRight';
import { Box, Typography, withStyles } from '@material-ui/core';

const Accordion = withStyles({
  root: {
    boxShadow: 'none',
    '&:not(:last-child)': {
      borderBottom: 0,
    },
    '&:before': {
      display: 'none',
    },
    '&$expanded': {
      margin: 'auto',
    },
  },
  expanded: {},
})(MuiAccordion);

const AccordionSummary = withStyles({
  root: {
    flexDirection: 'row-reverse',
    padding: 0,
    minHeight: 'auto',
    '&$expanded': {
      minHeight: 'auto',
    },
  },
  content: {
    margin: '0',
    '&$expanded': {
      margin: '0',
    },
  },
  expanded: {},
  expandIcon: {
    padding: '6px',
    marginLeft: '-6px',
    marginRight: '0',
    '&$expanded': {
      transform: 'rotate(90deg)',
    },
  },
})(MuiAccordionSummary);

const AccordionDetails = withStyles(theme => ({
  root: {
    padding: 0,
    marginTop: theme.spacing(1),
  },
}))(MuiAccordionDetails);

type SimpleAccordionProps = {
  title: string;
  children: React.ReactNode;
};

export const SimpleAccordion = ({ title, children }: SimpleAccordionProps) => {
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ArrowRightIcon />}>
        <Box display="flex" alignItems="center">
          <Typography variant="body2">{title}</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
};
