import { ReactNode, useState } from 'react';
import { Button, Flex, Text } from '@backstage/ui';

import { countNoun, INITIAL_ROWS } from '../../lib/toolset';

export type ShowMoreProps<T> = {
  items: T[];
  /** How many to render before asking for a click. */
  initial?: number;
  /** What the items are called in the button: `Show all 47 tools`. */
  noun: string;
  plural?: string;
  children: (visible: T[]) => ReactNode;
};

/**
 * Renders the first few items and a button for the rest — a list of hundreds
 * of rows is a page nobody scrolls, and a search is the better way through it.
 * The count of what is hidden stays visible, so the button says what it costs.
 */
export function ShowMore<T>({
  items,
  initial = INITIAL_ROWS,
  noun,
  plural,
  children,
}: ShowMoreProps<T>) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, initial);
  const hidden = items.length - visible.length;

  return (
    <Flex direction="column" gap="2">
      {children(visible)}
      {hidden > 0 && (
        <Flex align="center" gap="2">
          <Button
            variant="tertiary"
            size="small"
            onPress={() => setShowAll(true)}
          >
            Show all {countNoun(items.length, noun, plural)}
          </Button>
          <Text variant="body-x-small" color="secondary">
            {countNoun(visible.length, noun, plural)} shown, {hidden} more
          </Text>
        </Flex>
      )}
    </Flex>
  );
}
