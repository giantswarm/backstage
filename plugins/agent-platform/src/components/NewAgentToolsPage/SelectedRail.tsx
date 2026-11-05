import type { ReactNode } from 'react';
import { Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ShowMore } from '@giantswarm/backstage-plugin-ui-react';

import type { ToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  type CatalogueGroup,
  countNoun,
  presetNameOf,
  presetLabel,
} from '../../lib/toolset';
import { railGroups, railToolLabel, type RailGroup } from './connectorChoice';
import { RAIL_ROWS, toolsetEffect } from './ToolsetSummaryBar';

const useStyles = makeStyles(theme => ({
  // The artboard's tinted "Selected" rail (CreateAgentTools), docked by the
  // wizard frame beside the step.
  rail: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
    padding: theme.spacing(2.5),
    borderRadius: 16,
    background: `var(--agent-shell-rail-bg, ${theme.palette.background.default})`,
  },
  changes: {
    padding: theme.spacing(1.25, 1.5),
    borderRadius: 10,
    background: 'var(--bui-warning-bg-subdued, #fff3e8)',
    color: 'var(--bui-warning-fg-subdued, #7d3900)',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    fontSize: 13,
  },
  label: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  remove: {
    flex: 'none',
    border: 0,
    background: 'none',
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    font: 'inherit',
    lineHeight: 1,
    padding: 0,
  },
}));

function entryLabel(selector: string, group: RailGroup): string {
  const preset = presetNameOf(selector);
  if (preset !== undefined) {
    return presetLabel(preset);
  }
  // The prefix muster gives the tools is the connector's name, which the key
  // carries; the title is what people call it.
  return railToolLabel(
    selector,
    group.key.startsWith('connector:')
      ? group.key.slice('connector:'.length)
      : undefined,
  );
}

function Entry({
  label,
  title,
  removeLabel,
  onRemove,
}: {
  label: string;
  title: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  const classes = useStyles();
  return (
    <li className={classes.row}>
      <span className={classes.label} title={title}>
        {label}
      </span>
      <button
        type="button"
        className={classes.remove}
        aria-label={removeLabel}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}

export type SelectedRailProps = {
  selectors: string[];
  catalogue: CatalogueGroup[];
  resolution: ToolsetResolution;
  unsigned: string[];
  problems: string[];
  onRemove: (selectors: string[]) => void;
  /** Opens the individual tools and scrolls to the resolved list. */
  onShowDetails?: () => void;
  /** The sign-in tool the wizard adds, or the warning once it was removed. */
  signInNote?: ReactNode;
};

/**
 * *Selected* (F7): what the step has chosen, always in view beside it — how
 * many tools that is for the author, how many of them change things, and the
 * selection itself, grouped by connector, each entry removable. Says nothing
 * about asking before a change: the wizard sets no approval (F2).
 */
export function SelectedRail({
  selectors,
  catalogue,
  resolution,
  unsigned,
  problems,
  onRemove,
  onShowDetails,
  signInNote,
}: SelectedRailProps) {
  const classes = useStyles();
  const effect = toolsetEffect({ selectors, resolution, unsigned, problems });
  // The artboard's "N tools" once resolved; otherwise what the state is.
  const headline =
    resolution.status === 'resolved' && effect.line.startsWith('Resolves to')
      ? countNoun(resolution.tools.length, 'tool')
      : effect.line;
  const notes = effect.changes !== undefined ? effect.qualifiers : effect.hint;
  const groups = railGroups(selectors, catalogue);

  return (
    <aside className={classes.rail} aria-label="Selected">
      <Text variant="body-small" color="secondary">
        Selected
      </Text>
      <Text variant="title-small" color={effect.tone}>
        {headline}
      </Text>
      {effect.changes && (
        <Text variant="body-small" className={classes.changes}>
          {effect.changes}
        </Text>
      )}
      {notes && (
        <Text variant="body-x-small" color="secondary">
          {notes}
        </Text>
      )}
      {groups.map(group => (
        <Flex key={group.key} direction="column" gap="1">
          <Text variant="body-x-small" weight="bold">
            {group.title}
          </Text>
          <ShowMore
            items={group.selectors}
            initial={RAIL_ROWS}
            noun="tool"
            revealAll
          >
            {visible => (
              <ul className={classes.group} aria-label={group.title}>
                {group.whole && (
                  <Entry
                    label="All tools, including ones added later"
                    title={group.whole}
                    removeLabel={`Remove all of ${group.title}`}
                    onRemove={() => onRemove([group.whole!])}
                  />
                )}
                {visible.map(selector => {
                  const label = entryLabel(selector, group);
                  return (
                    <Entry
                      key={selector}
                      label={label}
                      title={selector}
                      removeLabel={`Remove ${
                        presetNameOf(selector) === undefined ? selector : label
                      }`}
                      onRemove={() => onRemove([selector])}
                    />
                  );
                })}
              </ul>
            )}
          </ShowMore>
        </Flex>
      ))}
      {signInNote}
      {onShowDetails && selectors.length > 0 && (
        <Button variant="tertiary" size="small" onPress={onShowDetails}>
          Show the resolved list
        </Button>
      )}
    </aside>
  );
}
