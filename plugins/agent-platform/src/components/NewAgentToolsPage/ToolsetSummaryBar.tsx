import { useId, useState } from 'react';
import { Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import {
  PHONE_QUERY,
  TOUCH_QUERY,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import type { ToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  countNoun,
  declaredToolset,
  labelOfPresetSelector,
  selectorLabel,
  toolsetShape,
} from '../../lib/toolset';
import { changingToolCount } from './catalogueEffect';

const useStyles = makeStyles(theme => ({
  // The artboard's tinted "Selected" rail (CreateAgentTools), as a sticky bar
  // over the one-column step: the shell's rail tint, the radius of the
  // create flow's other tinted panels, and a light shadow so it still reads
  // as lifted over the cards scrolling beneath it.
  bar: {
    position: 'sticky',
    top: theme.spacing(1),
    zIndex: 2,
    padding: theme.spacing(1.5, 2),
    borderRadius: 12,
    border: '1px solid var(--bui-border-1, transparent)',
    background: `var(--agent-shell-rail-bg, ${theme.palette.background.paper})`,
    boxShadow: theme.shadows[1],
  },
  // At phone width the bar is one line in the flow (C12): sticky and wrapped
  // to five lines of chips it left the catalogue a few hundred pixels, and
  // none with the keyboard open.
  barPhone: {
    position: 'static',
    padding: theme.spacing(0.5, 1),
  },
  toggle: {
    width: '100%',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    border: 0,
    background: 'none',
    padding: theme.spacing(0.5, 1),
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    '& svg': {
      flex: 'none',
      marginLeft: 'auto',
      transition: 'transform 150ms',
    },
    '&[aria-expanded="true"] svg': { transform: 'rotate(180deg)' },
  },
  toggleText: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  expanded: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 1, 1),
  },
  selectors: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  selector: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontSize: 13,
    padding: theme.spacing(0.25, 1),
    borderRadius: 999,
    border: `1px solid ${theme.palette.divider}`,
    // White on the tinted bar, as the artboard's selected-chips tray.
    background: `var(--bui-bg-neutral-1, ${theme.palette.background.paper})`,
    // A long `tool:` selector wraps inside its chip, not past the bar.
    minWidth: 0,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  },
  selectorCode: {
    fontFamily: 'monospace',
  },
  removeSelector: {
    border: 0,
    background: 'none',
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    font: 'inherit',
    lineHeight: 1,
    padding: 0,
    flex: 'none',
    // A thumb's target (44px) without a taller chip: the negative margin
    // gives back what the hit area adds to the layout.
    [`@media ${PHONE_QUERY}, ${TOUCH_QUERY}`]: {
      minWidth: 44,
      minHeight: 44,
      margin: '-14px -12px -14px -8px',
    },
  },
  effect: {
    textAlign: 'right',
  },
}));

export type ToolsetEffect = {
  /** One line: what the selection amounts to for the author right now. */
  line: string;
  /** Qualifications, when there are any: unmatched selectors, a sign-in owed, a cut list. */
  hint?: string;
  /** Of a resolved toolset: "N of them change things", when any do. */
  changes?: string;
  /** The hint without {@link changes}, for a surface that shows it apart. */
  qualifiers?: string;
  tone: 'primary' | 'secondary' | 'warning' | 'danger';
};

/**
 * The effect of the selection in one line, for the summary that stays in view
 * — so a click on a preset shows its consequence without a scroll to the
 * resolved list. Mirrors the states `ToolsetResolutionList` renders in full.
 */
export function toolsetEffect({
  selectors,
  resolution,
  unsigned,
  problems,
}: {
  selectors: string[];
  resolution: ToolsetResolution;
  unsigned: string[];
  problems: string[];
}): ToolsetEffect {
  if (problems.length > 0) {
    return {
      line: 'The toolset cannot be applied as it is',
      hint: problems[0],
      tone: 'danger',
    };
  }
  // The empty selection is no tools — said here, where the author is looking.
  const shape = toolsetShape(declaredToolset(selectors));
  if (shape === 'none') {
    return {
      line: 'No tools',
      hint: 'Nothing selected: the agent works from its prompt and skills alone.',
      tone: 'primary',
    };
  }
  if (shape === 'full') {
    return {
      line: 'Full gateway access',
      hint: 'The agent can call every tool the gateway exposes to whoever invokes it, platform administration included.',
      tone: 'warning',
    };
  }
  const hints: string[] = [];
  if (unsigned.length > 0) {
    hints.push(
      `${countNoun(unsigned.length, 'connector')} selected without a sign-in`,
    );
  }
  switch (resolution.status) {
    case 'loading':
      return { line: 'Resolving…', tone: 'secondary' };
    case 'unknown-preset':
      return {
        line: 'Names a preset this environment does not define',
        hint: resolution.error,
        tone: 'danger',
      };
    case 'unsupported':
      return {
        line: "This environment's muster does not evaluate toolsets yet",
        hint: 'The agent carries the toolset it declares; this muster ignores it until it is upgraded.',
        tone: 'warning',
      };
    case 'error':
      return {
        line: 'Could not resolve the toolset',
        hint: resolution.error,
        tone: 'warning',
      };
    case 'unavailable':
      return {
        line: countNoun(selectors.length, 'selector'),
        hint: 'What it resolves to cannot be shown in this portal.',
        tone: 'secondary',
      };
    case 'resolved': {
      // The artboard's rail: how much of it can change things. Said plainly,
      // without the artboard's "the agent asks people before using them" —
      // the wizard sets no approval on the agent (T60 gap note, F2).
      const changing = changingToolCount(resolution.tools);
      let changes: string | undefined;
      if (changing > 0) {
        changes =
          changing === resolution.tools.length
            ? `${changing === 1 ? 'It changes' : 'All of them change'} things`
            : `${changing} of them change things`;
      }
      if (resolution.unmatched.length > 0) {
        hints.push(
          `${countNoun(
            resolution.unmatched.length,
            'selector',
          )} match nothing for you`,
        );
      }
      if (resolution.truncated) {
        hints.push('list cut short');
      }
      const all = changes ? [changes, ...hints] : hints;
      return {
        line: `Resolves to ${countNoun(resolution.tools.length, 'tool')} for you`,
        hint: all.length > 0 ? all.join(' · ') : undefined,
        changes,
        qualifiers: hints.length > 0 ? hints.join(' · ') : undefined,
        tone: 'primary',
      };
    }
    default:
      return {
        line: countNoun(selectors.length, 'selector'),
        hint: hints.length > 0 ? hints.join(' · ') : undefined,
        tone: 'secondary',
      };
  }
}

export type ToolsetSummaryBarProps = {
  selectors: string[];
  onRemove: (selector: string) => void;
  resolution: ToolsetResolution;
  /** `server:` selectors whose server the author has not signed in to. */
  unsigned: string[];
  /** Why the toolset cannot be applied, when it cannot. */
  problems: string[];
  /** Scrolls to the full resolved list. */
  onShowDetails: () => void;
};

/**
 * *Selected so far*: the step's own output as removable chips, and what it
 * resolves to, in a bar that stays at the top of the viewport while the author
 * browses the catalogue below. The full resolved list lives further down; this
 * is the part that must never need a scroll.
 */
export function ToolsetSummaryBar({
  selectors,
  onRemove,
  resolution,
  unsigned,
  problems,
  onShowDetails,
}: ToolsetSummaryBarProps) {
  const classes = useStyles();
  const effect = toolsetEffect({ selectors, resolution, unsigned, problems });
  const isPhone = usePhoneLayout();
  const [isExpanded, setExpanded] = useState(false);
  const detailsId = useId();

  const chips =
    selectors.length === 0 ? (
      <Text variant="body-small" color="secondary">
        Nothing is added yet; a preset is the usual start.
      </Text>
    ) : (
      <div className={classes.selectors} role="list" aria-label="Toolset">
        {selectors.map(selector => {
          const label = selectorLabel(selector);
          return (
            <span
              key={selector}
              className={
                labelOfPresetSelector(selector) === undefined
                  ? `${classes.selector} ${classes.selectorCode}`
                  : classes.selector
              }
              role="listitem"
            >
              {/* On the label, not the chip: the remove button would
                  otherwise show the selector as its own hint. */}
              <span title={selector}>{label}</span>
              <button
                type="button"
                className={classes.removeSelector}
                aria-label={`Remove ${label}`}
                onClick={() => onRemove(selector)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    );

  const showDetails = (
    <Button variant="tertiary" size="small" onPress={onShowDetails}>
      Show the resolved list
    </Button>
  );

  if (isPhone) {
    // One line that opens to the chips: how many are selected and what they
    // amount to, which is what a click on a preset needs to confirm.
    return (
      <div
        className={`${classes.bar} ${classes.barPhone}`}
        role="region"
        aria-label="Selected so far"
      >
        <button
          type="button"
          className={classes.toggle}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          onClick={() => setExpanded(value => !value)}
        >
          <span className={classes.toggleText}>
            <Text variant="body-small" color="secondary">
              {selectors.length === 0
                ? 'Nothing selected'
                : `${selectors.length} selected`}
              {' · '}
              <Text
                as="span"
                variant="body-small"
                weight="bold"
                color={effect.tone}
              >
                {effect.line}
              </Text>
            </Text>
          </span>
          <ExpandMoreIcon aria-hidden />
        </button>
        {/* `hidden` alone loses to the class's display. */}
        <div
          id={detailsId}
          className={classes.expanded}
          hidden={!isExpanded}
          style={isExpanded ? undefined : { display: 'none' }}
        >
          {isExpanded && (
            <>
              {chips}
              {effect.hint && (
                <Text variant="body-x-small" color="secondary">
                  {effect.hint}
                </Text>
              )}
              {showDetails}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={classes.bar} role="region" aria-label="Selected so far">
      <Flex
        align="center"
        justify="between"
        gap="3"
        style={{ flexWrap: 'wrap' }}
      >
        <Flex direction="column" gap="1" grow basis="240px">
          <Text variant="body-x-small" color="secondary">
            Selected so far
          </Text>
          {chips}
        </Flex>
        <Flex direction="column" align="end" gap="1" className={classes.effect}>
          <Text variant="body-small" weight="bold" color={effect.tone}>
            {effect.line}
          </Text>
          {effect.hint && (
            <Text variant="body-x-small" color="secondary">
              {effect.hint}
            </Text>
          )}
          {showDetails}
        </Flex>
      </Flex>
    </div>
  );
}
