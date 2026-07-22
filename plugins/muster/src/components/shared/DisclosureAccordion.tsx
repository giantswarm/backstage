import { ReactNode, useState } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import { Accordion, AccordionPanel, AccordionTrigger } from '@backstage/ui';

const useStyles = makeStyles((theme: Theme) => ({
  accordion: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.paper,
    '&:not(:last-child)': {
      marginBottom: theme.spacing(1),
    },
  },
  trigger: {
    // The consumer summaries are full-width flex rows that right-align their
    // trailing badges via `marginLeft: auto`; keep the trigger content able to
    // fill the bui trigger button so that alignment still works.
    '& > button': {
      width: '100%',
    },
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 0,
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
 *
 * Controlled so that the panel content only mounts while expanded, matching the
 * previous `unmountOnExit` behaviour -- the panels run live k8s/muster queries,
 * so collapsed rows must not fire them.
 */
export function DisclosureAccordion({
  summary,
  children,
  defaultExpanded,
}: DisclosureAccordionProps) {
  const classes = useStyles();
  const [isExpanded, setExpanded] = useState(Boolean(defaultExpanded));
  return (
    <Accordion
      className={classes.accordion}
      isExpanded={isExpanded}
      onExpandedChange={setExpanded}
    >
      <AccordionTrigger className={classes.trigger}>{summary}</AccordionTrigger>
      <AccordionPanel className={classes.details}>
        {isExpanded ? children : null}
      </AccordionPanel>
    </Accordion>
  );
}
