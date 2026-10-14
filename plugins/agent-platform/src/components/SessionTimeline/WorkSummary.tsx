import { ReactNode, useState } from 'react';
import { Badge } from '@backstage/ui';
import { Collapse, makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import LoopIcon from '@material-ui/icons/Loop';

import { TimelineItem } from '../../lib/kagentTimeline';
import { summarizeWork } from './helpers';

const ANIMATION_DURATION = 200;

const useStyles = makeStyles(theme => ({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    maxWidth: '100%',
    border: 'none',
    background: 'none',
    padding: theme.spacing(0.5, 0),
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    textAlign: 'left',
    color: theme.palette.text.secondary,
    cursor: 'pointer',
    '&:hover': {
      color: theme.palette.text.primary,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
      borderRadius: 'var(--bui-radius-1)',
    },
  },
  done: {
    width: 15,
    height: 15,
    flexShrink: 0,
    color: theme.palette.success.main,
  },
  // The same turning glyph a running call carries in its own row.
  spinner: {
    width: 15,
    height: 15,
    flexShrink: 0,
    animation: '$spin 1s linear infinite',
    '@media (prefers-reduced-motion)': {
      animation: 'none',
    },
  },
  '@keyframes spin': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(-360deg)' },
  },
  chevron: {
    width: 16,
    height: 16,
    flexShrink: 0,
    transition: theme.transitions.create('transform', {
      duration: ANIMATION_DURATION,
      easing: theme.transitions.easing.easeOut,
    }),
  },
  chevronOpen: {
    transform: 'rotate(90deg)',
  },
  // Hangs under the summary's icon, a rule on its left — the prototype's
  // "these steps belong to that line".
  body: {
    display: 'flex',
    flexDirection: 'column',
    margin: theme.spacing(0.75, 0, 0.5, 0.875),
    paddingLeft: theme.spacing(2),
    borderLeft: `1px solid ${theme.palette.divider}`,
    minWidth: 0,
  },
  technicalMeta: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    padding: theme.spacing(0.5, 0),
  },
}));

export type WorkSummaryProps = {
  /** Stable id, tying the summary to its panel for assistive tech. */
  id: string;
  /** The folded run: reasoning, tool calls and delegations, in order. */
  items: TimelineItem[];
  /**
   * The run is still being added to — the agent is working and this is where
   * its work lands. It then starts open, so the progress is visible, and folds
   * once the turn ends (unless the reader opened or closed it themselves).
   */
  isLive: boolean;
  /** Whether the agent is mid-turn, for the pending calls' marker. */
  isAgentWorking: boolean;
  /** The run's entries, rendered by the caller as the technical trace. */
  children: ReactNode;
};

/**
 * One line standing for a run of the agent's work — "✓ Used 3 tools ›" — that
 * opens onto the steps, per the prototype's turn anatomy.
 *
 * Folded once the turn is done: the reply is what the reader came for. Opening
 * it shows the full technical trace directly — exact tool names, arguments and
 * results — with no second "show technical details" step: clicking the
 * summary *is* the decision to learn more (PO, 2026-10-10).
 */
export function WorkSummary({
  id,
  items,
  isLive,
  isAgentWorking,
  children,
}: WorkSummaryProps) {
  const classes = useStyles();
  // `undefined` until the reader decides; until then the default follows the
  // run — open while live, folded otherwise — so a turn that ends folds its
  // work away without a remount.
  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const isOpen = override ?? isLive;
  const panelId = `work-summary-${id}`;
  const { label, technicalLabel } = summarizeWork(items);

  const hasUnansweredCall =
    !isAgentWorking &&
    items.some(
      item =>
        (item.kind === 'tool-call' || item.kind === 'agent-call') &&
        item.isPending,
    );

  let status: ReactNode = <CheckIcon className={classes.done} aria-hidden />;
  if (isLive) {
    status = <LoopIcon className={classes.spinner} aria-hidden />;
  } else if (hasUnansweredCall) {
    status = null;
  }

  return (
    <div data-testid="timeline-work-summary">
      <button
        type="button"
        className={classes.trigger}
        aria-expanded={isOpen}
        // The panel exists only while open (see the Collapse below), so the
        // reference does too — it never points at an element that isn't there.
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setOverride(!isOpen)}
      >
        {status}
        <span>{label}</span>
        {hasUnansweredCall && <Badge size="small">no result</Badge>}
        <ChevronRightIcon
          className={`${classes.chevron} ${isOpen ? classes.chevronOpen : ''}`}
          aria-hidden
        />
      </button>
      {/* Mounted only while open: a long agentic session folds hundreds of
          tool calls, each with its own payload fold-outs, and keeping every
          folded trace in the DOM was most of the page's weight (T39). A live
          run starts open, so its progress mounts as it arrives. */}
      <Collapse
        in={isOpen}
        timeout={ANIMATION_DURATION}
        mountOnEnter
        unmountOnExit
      >
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className={classes.body}
        >
          <span className={classes.technicalMeta}>{technicalLabel}</span>
          {children}
        </div>
      </Collapse>
    </div>
  );
}
