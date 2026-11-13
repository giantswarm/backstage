import { useState } from 'react';
import { Accordion, AccordionPanel, AccordionTrigger } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useSimpleAccordionStyles } from '@giantswarm/backstage-plugin-ui-react';

const useStyles = makeStyles({
  // A provider's error is one long line with its own breaks: it keeps them
  // and wraps anywhere rather than widen the timeline.
  text: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontFamily: 'var(--bui-font-monospace)',
    fontSize: '0.8125rem',
  },
});

/**
 * kagent's own words for a failed turn, folded under "Technical details" and
 * mounted only while open.
 */
export function TurnFailureDetails({ text }: { text: string }) {
  const classes = useStyles();
  const spacing = useSimpleAccordionStyles();
  const [isExpanded, setExpanded] = useState(false);

  return (
    <Accordion
      className={spacing.group}
      isExpanded={isExpanded}
      onExpandedChange={setExpanded}
    >
      <AccordionTrigger level={4}>Technical details</AccordionTrigger>
      <AccordionPanel>
        {isExpanded ? <span className={classes.text}>{text}</span> : null}
      </AccordionPanel>
    </Accordion>
  );
}
