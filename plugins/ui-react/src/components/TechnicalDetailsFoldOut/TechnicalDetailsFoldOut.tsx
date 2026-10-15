import { ReactNode, useState } from 'react';
import { Accordion, AccordionPanel, AccordionTrigger } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useSimpleAccordionStyles } from '../SimpleAccordion';

const BORDER_WIDTH = 1;

/**
 * How far the fold-out's title sits in from its edge: its border plus bui's
 * accordion padding. Content above the fold-out that should line up with the
 * title (`FoldOutAlignedSection`) is inset by this.
 */
export const TECHNICAL_DETAILS_TITLE_INSET = `calc(var(--bui-space-3) + ${BORDER_WIDTH}px)`;

const useStyles = makeStyles({
  // Outlined like the create flow's review step "Technical details".
  foldOut: {
    border: `${BORDER_WIDTH}px solid var(--bui-border-1)`,
    borderRadius: 12,
  },
});

export type TechnicalDetailsFoldOutProps = {
  /** Open on arrival, e.g. while the resource is not healthy. */
  defaultExpanded: boolean;
  /**
   * Follow later changes of `defaultExpanded`, both ways, until the person
   * opens or closes the fold-out themselves: a page that renders from the
   * cache first must neither leave a reason the fresh read found folded away
   * nor keep open what a stale copy opened. Opt-in, for the model and
   * connector pages. Key the fold-out, or a parent, by the resource, so
   * another one starts afresh: the model page keys its Details tab, the
   * connector page its whole content. Without it, `defaultExpanded` only seeds the first
   * render, as on the agent page.
   */
  followDefaultExpanded?: boolean;
  /**
   * The trigger's label, for one piece of technical detail with a name of its
   * own (a tool's "Input schema"). Defaults to "Technical details".
   */
  title?: string;
  children: ReactNode;
};

/**
 * "Technical details", folded in place — the shell's one way to offer
 * technical detail on a page, never a page-wide switch. Controlled, so the
 * cards inside (which read the HelmRelease, GitOps source and conditions)
 * mount only while open: bui's panel otherwise stays mounted, merely hidden.
 * Shared by the agent, model and connector pages, and under its own `title`
 * by the tool page's input schema.
 */
export function TechnicalDetailsFoldOut({
  defaultExpanded,
  followDefaultExpanded = false,
  title = 'Technical details',
  children,
}: TechnicalDetailsFoldOutProps) {
  const classes = useStyles();
  const spacing = useSimpleAccordionStyles();
  const [isExpanded, setExpanded] = useState(defaultExpanded);
  const [isToggled, setToggled] = useState(false);
  // Adjusted while rendering, React's pattern for state that follows a prop:
  // the fold-out follows `defaultExpanded` until the person has toggled it.
  const [seededWith, setSeededWith] = useState(defaultExpanded);
  if (followDefaultExpanded && defaultExpanded !== seededWith) {
    setSeededWith(defaultExpanded);
    if (!isToggled) {
      setExpanded(defaultExpanded);
    }
  }
  const toggle = (expanded: boolean) => {
    setToggled(true);
    setExpanded(expanded);
  };
  return (
    <Accordion
      className={`${classes.foldOut} ${spacing.group}`}
      isExpanded={isExpanded}
      onExpandedChange={toggle}
    >
      {/* h2: a section of the page beside its other sections. */}
      <AccordionTrigger level={2}>{title}</AccordionTrigger>
      <AccordionPanel>{isExpanded ? children : null}</AccordionPanel>
    </Accordion>
  );
}
