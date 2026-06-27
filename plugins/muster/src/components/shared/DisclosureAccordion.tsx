import { ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  makeStyles,
  Theme,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

const useStyles = makeStyles((theme: Theme) => ({
  accordion: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    boxShadow: 'none',
    backgroundColor: theme.palette.background.paper,
    '&:not(:last-child)': {
      marginBottom: theme.spacing(1),
    },
    '&:before': {
      display: 'none',
    },
    '&$expanded': {
      margin: `0 0 ${theme.spacing(1)}px`,
    },
  },
  expanded: {},
  summary: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    '&$expanded': {
      minHeight: 48,
    },
  },
  summaryContent: {
    alignItems: 'center',
    '&$expanded': {
      margin: '12px 0',
    },
  },
  details: {
    flexDirection: 'column',
    paddingTop: 0,
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    paddingBottom: theme.spacing(2),
  },
}));

export interface DisclosureAccordionProps {
  /** The clickable summary row content (name + meta + state + count). */
  summary: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
}

/**
 * A flat, outlined disclosure styled to look like the mockups' `<details>`
 * card rows: no shadow, a subtle border, rounded corners, and a summary row
 * that carries the name/meta/state on the left and content below when opened.
 */
export function DisclosureAccordion({
  summary,
  children,
  defaultExpanded,
}: DisclosureAccordionProps) {
  const classes = useStyles();
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      classes={{ root: classes.accordion, expanded: classes.expanded }}
      TransitionProps={{ unmountOnExit: true }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        classes={{
          root: classes.summary,
          content: classes.summaryContent,
          expanded: classes.expanded,
        }}
      >
        {summary}
      </AccordionSummary>
      <AccordionDetails className={classes.details}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
