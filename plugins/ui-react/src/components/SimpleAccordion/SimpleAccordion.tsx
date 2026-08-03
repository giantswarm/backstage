import { ReactNode, useId } from 'react';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  group: {
    // bui's accordion trigger has no bottom padding, so an expanded header sits
    // flush against its panel and the whole thing reads top-heavy. Added only
    // when expanded — a collapsed header would otherwise look padded on one side.
    //
    // The selector must reach the *button*. `AccordionTrigger` renders an
    // `<h3 class="bui-AccordionTrigger">` wrapping a
    // `<button class="bui-AccordionTriggerButton" aria-expanded>`, so
    // `&[aria-expanded="true"]` on the trigger's own element matches nothing.
    '& .bui-AccordionTriggerButton[aria-expanded="true"]': {
      paddingBottom: theme.spacing(1),
    },
  },
}));

export type SimpleAccordionProps = {
  /**
   * The clickable header. A plain string for the common case; any node when the
   * header carries more than a label (a status, a timestamp, a badge).
   */
  title: ReactNode;
  children: ReactNode;
  /** Open on first render. Only applies on mount — see the note below. */
  defaultExpanded?: boolean;
};

/**
 * A single collapsible section, with the spacing bui leaves out.
 *
 * Prefer this over composing `Accordion`/`AccordionTrigger`/`AccordionPanel`
 * directly — a hand-composed accordion needs the trigger-padding fix above, and
 * the selector it requires is easy to get wrong in a way that fails silently.
 *
 * Each instance is its own `AccordionGroup`, so sections expand independently.
 * For a set where only one may be open at a time, or where expansion is
 * controlled, compose bui's primitives directly and apply
 * {@link useSimpleAccordionStyles} to keep the spacing.
 *
 * `defaultExpanded` maps to the group's `defaultExpandedKeys`, which bui reads
 * only on mount: to re-seed it when the content changes, give the element a
 * React `key` that changes with it.
 */
export const SimpleAccordion = ({
  title,
  children,
  defaultExpanded,
}: SimpleAccordionProps) => {
  const classes = useStyles();
  // bui identifies an accordion within its group by id, and this component owns
  // the group — so generate one rather than making every caller invent a unique
  // string. A title-derived id would not work for a node title anyway.
  const id = useId();

  return (
    <AccordionGroup
      className={classes.group}
      defaultExpandedKeys={defaultExpanded ? new Set([id]) : undefined}
    >
      <Accordion id={id}>
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionPanel>{children}</AccordionPanel>
      </Accordion>
    </AccordionGroup>
  );
};

/**
 * The trigger-spacing fix on its own, for the cases {@link SimpleAccordion}
 * cannot serve (controlled expansion, exclusive groups). Apply the returned
 * `group` class to the `AccordionGroup` — or to any element wrapping the
 * accordions.
 */
export const useSimpleAccordionStyles = useStyles;
