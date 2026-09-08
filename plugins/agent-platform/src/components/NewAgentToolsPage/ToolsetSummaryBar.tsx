import { Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import type { ToolsetResolution } from '../../hooks/useToolsetResolution';
import { countNoun, declaredToolset, toolsetShape } from '../../lib/toolset';

const useStyles = makeStyles(theme => ({
  bar: {
    position: 'sticky',
    top: theme.spacing(1),
    zIndex: 2,
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    boxShadow: theme.shadows[2],
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
    fontFamily: 'monospace',
    fontSize: 13,
    padding: theme.spacing(0.25, 1),
    borderRadius: 999,
    border: `1px solid ${theme.palette.divider}`,
  },
  removeSelector: {
    border: 0,
    background: 'none',
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    font: 'inherit',
    lineHeight: 1,
    padding: 0,
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
      hint: 'Every tool the gateway exposes to whoever invokes the agent, platform administration included.',
      tone: 'warning',
    };
  }
  const hints: string[] = [];
  if (unsigned.length > 0) {
    hints.push(
      `${countNoun(unsigned.length, 'server')} selected without a sign-in`,
    );
  }
  switch (resolution.status) {
    case 'loading':
      return { line: 'Resolving…', tone: 'secondary' };
    case 'unknown-preset':
      return {
        line: 'Names a preset this installation does not define',
        hint: resolution.error,
        tone: 'danger',
      };
    case 'unsupported':
      return {
        line: "This installation's muster does not evaluate toolsets yet",
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
      return {
        line: `Resolves to ${countNoun(resolution.tools.length, 'tool')} for you`,
        hint: hints.length > 0 ? hints.join(' · ') : undefined,
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
          {selectors.length === 0 ? (
            <Text variant="body-small" color="secondary">
              Nothing added yet — a preset is the usual start.
            </Text>
          ) : (
            <div className={classes.selectors} role="list" aria-label="Toolset">
              {selectors.map(selector => (
                <span
                  key={selector}
                  className={classes.selector}
                  role="listitem"
                >
                  {selector}
                  <button
                    type="button"
                    className={classes.removeSelector}
                    aria-label={`Remove ${selector}`}
                    onClick={() => onRemove(selector)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
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
          <Button variant="tertiary" size="small" onPress={onShowDetails}>
            Show the resolved list
          </Button>
        </Flex>
      </Flex>
    </div>
  );
}
