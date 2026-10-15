import { ReactNode } from 'react';
import { Button, DialogTrigger, Popover, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import type {
  ContextReading,
  TokenUsage,
} from '@giantswarm/backstage-plugin-agent-platform-common';

import { contextWindowFor, contextUsage } from '../../lib/contextWindows';
import {
  formatCount,
  formatMoney,
  formatPercent,
  formatTokens,
  useCurrency,
} from '../../lib/formatNumbers';

const useStyles = makeStyles(theme => ({
  // The prototype's chip: cost, a divider, the context ring — one quiet bui
  // button that opens the details, on the neutral ground of a chip rather
  // than a tertiary button's bare one.
  trigger: {
    background: `var(--bui-bg-neutral-2, ${theme.palette.action.hover})`,
    color: `var(--bui-fg-secondary, ${theme.palette.text.secondary})`,
    whiteSpace: 'nowrap',
    '& > span': {
      gap: theme.spacing(1.25),
    },
    '&[data-hovered]': {
      color: `var(--bui-fg-primary, ${theme.palette.text.primary})`,
    },
  },
  divider: {
    width: 1,
    height: 12,
    background: `var(--bui-border-2, ${theme.palette.divider})`,
  },
  context: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
  },
  content: {
    // Narrow enough for a 375px viewport with the pane's own padding.
    width: 'min(300px, calc(100vw - 48px))',
    display: 'flex',
    flexDirection: 'column',
    padding: theme.spacing(0.5, 0.5),
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    fontSize: '0.8125rem',
    padding: theme.spacing(0.75, 0),
    color: `var(--bui-fg-secondary, ${theme.palette.text.secondary})`,
  },
  rowValue: {
    fontWeight: 500,
    color: `var(--bui-fg-primary, ${theme.palette.text.primary})`,
    textAlign: 'right',
  },
  bar: {
    height: 6,
    borderRadius: 3,
    background: `var(--bui-bg-neutral-2, ${theme.palette.action.hover})`,
    overflow: 'hidden',
    margin: theme.spacing(0.5, 0, 1),
  },
  barFill: {
    height: '100%',
    background: `var(--bui-accent-bg, ${theme.palette.primary.main})`,
  },
  hint: {
    marginBottom: theme.spacing(0.75),
  },
  footnote: {
    fontSize: '0.75rem',
    lineHeight: 1.45,
    color: `var(--bui-fg-secondary, ${theme.palette.text.secondary})`,
    marginTop: theme.spacing(0.75),
  },
}));

/** The ring in the trigger: how full the context window is, at a glance. */
function ContextRing({ percent }: { percent: number }) {
  const circumference = 2 * Math.PI * 7.5;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        stroke="var(--bui-border-1, #dfe7ec)"
        strokeWidth="3"
      />
      <circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        stroke="var(--bui-accent-bg, #009fff)"
        strokeWidth="3"
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  const classes = useStyles();
  return (
    <div className={classes.row}>
      <span>{label}</span>
      <span className={classes.rowValue}>{value}</span>
    </div>
  );
}

export type SessionCostPopoverProps = {
  installation: string;
  /**
   * The model as the provider names it, for the context-window lookup —
   * the agent's ModelConfig `spec.model`, when it could be resolved.
   */
  model?: string;
  /** Session totals from the timeline. */
  tokens: TokenUsage;
  /** The newest usage reading — the context numerator; see `SessionTimeline.context`. */
  context?: ContextReading;
  /** The session's turn count. */
  taskCount: number;
  /** Estimated session cost in USD; undefined when no rate could be derived. */
  estimatedCostUsd?: number;
  /** The one line naming the rate the estimate used — see `describeCostBasis`. */
  costBasis: string;
};

/**
 * The session's cost and context use, behind one chip in the composer's controls —
 * always on screen, like the prototype's, rather than scrolled away with the
 * page header. The popover opens upward for the same reason.
 *
 * - **Estimated cost** prices kagent's token counts at an observed $/token
 *   rate (see `costEstimate.ts`) and is always labeled an estimate; the basis
 *   line says which rate it was.
 * - **Reported cost** appears only when the agent's runtime reported one per
 *   turn (the claude Harness does, ADK does not) — absent means not reported,
 *   never zero.
 * - **Context used** is the newest turn's largest model call (prompt plus
 *   output; see `SessionTimeline.context`) against the model's context window
 *   from app-config (`agentPlatform.models.contextWindows`). A model the table does not name
 *   shows the raw token count instead of a share — claiming a percentage of
 *   an unknown window would be invented precision — and so does a count above
 *   the configured window; a line under the row says which. A runtime that
 *   reports only turn totals (the claude Harness) has no per-call figure, so
 *   its context reads "Not reported".
 *
 * Costs show in the installation's configured currency
 * (`gs.installations.<name>.currency`), USD otherwise.
 */
export function SessionCostPopover({
  installation,
  model,
  tokens,
  context: contextReading,
  taskCount,
  estimatedCostUsd,
  costBasis,
}: SessionCostPopoverProps) {
  const classes = useStyles();

  const currency = useCurrency(installation);
  const { config } = useSignedInConfig();
  const windows = config?.getOptional<Record<string, unknown>>(
    'agentPlatform.models.contextWindows',
  );
  const context = contextUsage(
    contextReading,
    contextWindowFor(model, windows),
  );

  const reportedCostUsd = tokens.costUsd;
  // The chip leads with the figure a person acts on: the runtime's own number
  // when it reported one, the estimate otherwise.
  const chipCost = formatMoney(reportedCostUsd ?? estimatedCostUsd, currency);

  let contextChip: ReactNode = null;
  let contextValue: ReactNode = '—';
  // What the chip shows of the context, said for a screen reader.
  let contextLabel = '';
  // Why no share shows beside a raw count.
  let windowHint: string | undefined;
  if (context.kind === 'share') {
    contextChip = (
      <span className={classes.context}>
        <ContextRing percent={context.percent} />
        {formatPercent(context.percent)}
      </span>
    );
    contextValue = `${formatTokens(context.usedTokens)} of ${formatTokens(
      context.windowTokens,
    )} · ${formatPercent(context.percent)}`;
    contextLabel = `, ${formatPercent(context.percent)} of context used`;
  } else if (context.kind === 'tokens' || context.kind === 'over-window') {
    // Above the configured window the count stands, without a share of a
    // window it contradicts.
    contextChip = (
      <span className={classes.context}>
        {formatTokens(context.usedTokens)} ctx
      </span>
    );
    contextValue = `${formatTokens(context.usedTokens)} tokens`;
    contextLabel = `, ${formatTokens(context.usedTokens)} tokens of context`;
    // No catch-all window: a model the table does not name (a release newer
    // than the table, say) shows its count and says why there is no share,
    // rather than a share of a window it may not have.
    windowHint =
      context.kind === 'over-window'
        ? `Above the ${formatTokens(
            context.windowTokens,
          )} context window configured for this model: the setting may be too small, or the turn ran on another model.`
        : 'No context window is configured for this model, so no share is shown.';
  } else if (context.kind === 'unmeasured') {
    contextValue = 'Not reported';
  }

  return (
    <DialogTrigger>
      <Button
        variant="tertiary"
        size="small"
        className={classes.trigger}
        aria-label={`Session cost and context: ${chipCost}${contextLabel}`}
      >
        <span>{chipCost}</span>
        {contextChip && (
          <>
            <span className={classes.divider} aria-hidden="true" />
            {contextChip}
          </>
        )}
      </Button>
      {/* bui's Popover does not pass a name on, so the content is the named
          dialog; react-aria then leaves the popover itself unroled. */}
      <Popover placement="top end">
        <div
          className={classes.content}
          role="dialog"
          aria-label="Session cost and context"
        >
          <Text variant="body-small" weight="bold">
            This session
          </Text>
          <Row
            label="Est. cost"
            value={formatMoney(estimatedCostUsd, currency)}
          />
          {/* Beside the estimate, never in place of it: a figure only some
              runtimes report, summed over the turns that reported one. */}
          {reportedCostUsd !== undefined && (
            <Row
              label="Reported cost"
              value={formatMoney(reportedCostUsd, currency)}
            />
          )}
          <Row
            label="Tokens in / out"
            value={`${formatTokens(tokens.prompt)} / ${formatTokens(
              tokens.completion,
            )}`}
          />
          <Row label="Turns" value={formatCount(taskCount)} />
          <Row label="Context used" value={contextValue} />
          {windowHint && (
            <Text
              as="p"
              variant="body-x-small"
              color="secondary"
              className={classes.hint}
            >
              {windowHint}
            </Text>
          )}
          {context.kind === 'share' && (
            <div
              className={classes.bar}
              role="img"
              aria-label={`Context ${formatPercent(context.percent)} full`}
            >
              <div
                className={classes.barFill}
                style={{ width: `${context.percent}%` }}
              />
            </div>
          )}
          {/* One minimal sentence, per the design: the disclosure that keeps
              the estimate honest. Everything else the rows already say. */}
          <div className={classes.footnote}>{costBasis}</div>
        </div>
      </Popover>
    </DialogTrigger>
  );
}
