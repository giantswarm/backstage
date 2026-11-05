import type { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';

import { harnessTitle, type HarnessChoice } from '../../lib/harnesses';
import { useSelectableCardStyles } from '../SelectableCard';

export type HarnessSummaryProps = {
  choice: HarnessChoice;
  /**
   * A word on the Harness beneath its title: `PLATFORM_DEFAULT_LABEL` on the
   * platform Harness, "Current runtime" on the one an agent runs on.
   */
  mark?: string;
  /** Beside the title, such as an `InfoHint` on it. */
  titleAddon?: ReactNode;
  /**
   * The title at a fact list's value size rather than a card's bold one, for
   * a fact beside a page's content.
   */
  compact?: boolean;
};

/**
 * A Harness as a person reads it, wherever one is shown: the title (its
 * display name, else its runtime family), a mark beneath it, and the
 * Harness's name and image. The runtime cards of the agent wizard and of
 * Change Harness hold it, and so does the agent page's Runtime fact, so the
 * three read the same.
 */
export function HarnessSummary({
  choice,
  mark,
  titleAddon,
  compact = false,
}: HarnessSummaryProps) {
  const classes = useSelectableCardStyles();
  const title = compact ? (
    // A long display name wraps beside its addon, never past a phone's
    // 343px column.
    <Text
      variant="body-small"
      style={{ minWidth: 0, overflowWrap: 'anywhere' }}
    >
      {harnessTitle(choice)}
    </Text>
  ) : (
    <Text weight="bold">{harnessTitle(choice)}</Text>
  );

  return (
    <>
      {titleAddon ? (
        <Flex align="center" gap="1">
          {title}
          {titleAddon}
        </Flex>
      ) : (
        title
      )}
      {mark && (
        <Text variant="body-small" color="secondary">
          {mark}
        </Text>
      )}
      <Text
        variant="body-x-small"
        color="secondary"
        style={{ overflowWrap: 'anywhere' }}
      >
        Harness <span className={classes.code}>{choice.name}</span>
        {choice.imageName && (
          <>
            {' · '}
            <span className={classes.code}>{choice.imageName}</span>
          </>
        )}
      </Text>
    </>
  );
}
