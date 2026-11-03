import {
  forwardRef,
  ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Accordion, AccordionPanel, AccordionTrigger } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useSimpleAccordionStyles } from '../SimpleAccordion';
import { useMediaQueryMatch } from '../../utils/breakpoints';

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
   * another one starts afresh: the model page keys its Overview, the
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

/** What a page can ask of the fold-out from elsewhere on it. */
export type TechnicalDetailsFoldOutHandle = {
  /**
   * Open the fold-out, scroll it into view and move focus to its trigger,
   * e.g. for an alert's "Show conditions" above it on the same page. Counts
   * as the person's own choice, so a later `defaultExpanded` does not close
   * it again.
   */
  reveal: () => void;
};

/**
 * "Technical details", folded in place — the shell's one way to offer
 * technical detail on a page, never a page-wide switch. Controlled, so the
 * cards inside (which read the HelmRelease, GitOps source and conditions)
 * mount only while open: bui's panel otherwise stays mounted, merely hidden.
 * Shared by the agent, model and connector pages, and under its own `title`
 * by the tool page's input schema. A ref gives `reveal()`
 * (`TechnicalDetailsFoldOutHandle`).
 */
export const TechnicalDetailsFoldOut = forwardRef<
  TechnicalDetailsFoldOutHandle,
  TechnicalDetailsFoldOutProps
>(function TechnicalDetailsFoldOut(
  {
    defaultExpanded,
    followDefaultExpanded = false,
    title = 'Technical details',
    children,
  },
  ref,
) {
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

  // A reveal scrolls once the open panel is drawn, so the fold-out lands
  // where its content will be, not where the closed trigger was.
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useMediaQueryMatch('(prefers-reduced-motion: reduce)');
  const [revealRequest, setRevealRequest] = useState(0);
  useImperativeHandle(
    ref,
    () => ({
      reveal: () => {
        toggle(true);
        setRevealRequest(request => request + 1);
      },
    }),
    [],
  );
  useEffect(() => {
    const root = rootRef.current;
    if (revealRequest === 0 || !root) {
      return;
    }
    root.scrollIntoView?.({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    root.querySelector('button')?.focus({ preventScroll: true });
    // Only on a new request: a change of motion preference is no reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealRequest]);

  return (
    <div ref={rootRef}>
      <Accordion
        className={`${classes.foldOut} ${spacing.group}`}
        isExpanded={isExpanded}
        onExpandedChange={toggle}
      >
        {/* h2: a section of the page beside its other sections. */}
        <AccordionTrigger level={2}>{title}</AccordionTrigger>
        <AccordionPanel>{isExpanded ? children : null}</AccordionPanel>
      </Accordion>
    </div>
  );
});
