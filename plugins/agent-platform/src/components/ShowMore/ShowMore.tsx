import { ReactNode, useState } from 'react';
import { Button, Flex, Text } from '@backstage/ui';

import { countNoun, INITIAL_ROWS } from '../../lib/toolset';

export type ShowMoreProps<T> = {
  items: T[];
  /** How many to render before asking for a click, and how many each click adds. */
  initial?: number;
  /** What the items are called in the button: `Show 20 more tools`. */
  noun: string;
  plural?: string;
  children: (visible: T[]) => ReactNode;
};

/**
 * Renders the first few items and reveals the rest a page at a time — a list
 * of hundreds of rows is a page nobody scrolls, and one click that drops all
 * of them in trades a long list for a longer one. The count of what is hidden
 * stays visible, so the button says what it costs, and *Show fewer* takes the
 * list back to its first page. Searching, not scrolling, is how a specific
 * tool is found; the lists that need it carry a search field above them.
 */
export function ShowMore<T>({
  items,
  initial = INITIAL_ROWS,
  noun,
  plural,
  children,
}: ShowMoreProps<T>) {
  const [shown, setShown] = useState(initial);
  const visible = items.slice(0, shown);
  const hidden = items.length - visible.length;
  const nextPage = Math.min(initial, hidden);
  // `shown` is sticky, so a list that shrinks under it (a search narrowing the
  // bucket) would otherwise keep offering *Show fewer* with nothing to fold
  // away. What is actually rendered decides.
  const isExpanded = visible.length > initial;

  return (
    <Flex direction="column" gap="2">
      {children(visible)}
      {(hidden > 0 || isExpanded) && (
        <Flex align="center" gap="2">
          {hidden > 0 && (
            <Button
              variant="tertiary"
              size="small"
              onPress={() => setShown(count => count + initial)}
            >
              Show{' '}
              {countNoun(
                nextPage,
                `more ${noun}`,
                `more ${plural ?? `${noun}s`}`,
              )}
            </Button>
          )}
          {isExpanded && (
            <Button
              variant="tertiary"
              size="small"
              onPress={() => setShown(initial)}
            >
              Show fewer
            </Button>
          )}
          <Text variant="body-x-small" color="secondary">
            {countNoun(visible.length, noun, plural)} shown
            {hidden > 0 ? `, ${hidden} more` : ''}
          </Text>
        </Flex>
      )}
    </Flex>
  );
}
