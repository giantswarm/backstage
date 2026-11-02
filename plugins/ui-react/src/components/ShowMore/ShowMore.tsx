import { ReactNode, useState } from 'react';
import { Button, Flex, Text } from '@backstage/ui';

import { countNoun } from '../../utils/countNoun';

/**
 * How many rows a long list shows before asking for a click, and how many each
 * click adds: a gateway lists hundreds of tools, a fleet hundreds of agents,
 * and a page that renders every one of them at once is the page nobody
 * scrolls.
 */
export const INITIAL_ROWS = 20;

/**
 * A list shows a search field or a filter bar only when it holds more than
 * this many entries: three entries are read, not searched, and a filter over
 * them is volume framing. Lists that sit behind disclosures use a higher bar.
 */
export const SEARCH_MIN = 8;

/**
 * How many agents a "Used by" excerpt shows before *Show all N agents* — the
 * agents using one model, connector or skill, on that thing's own page.
 */
export const USED_BY_ROWS = 10;

/**
 * The most a page leaves hidden before it simply shows it: paging to hide one
 * card — "Show 1 more skill" for 21 skills — costs a click and a line of
 * chrome to save a row (live round 2, R9). A fifth of a page, never fewer
 * than two: 4 at the default 20, 2 at the "Used by" excerpt's 10.
 */
export function showMoreSlack(pageSize: number): number {
  return Math.max(2, Math.floor(pageSize / 5));
}

export type ShowMoreProps<T> = {
  items: T[];
  /** How many to render before asking for a click, and how many each click adds. */
  initial?: number;
  /**
   * How many to render at first, when that is more than `initial`: enough to
   * show again the row a person left the list from. Clicks still add
   * `initial`, and *Show fewer* goes back to `initial`.
   */
  initialShown?: number;
  /** What the items are called in the button: `Show 20 more tools`. */
  noun: string;
  plural?: string;
  /**
   * Reveal everything in one click — `Show all 40 agents` — instead of a page
   * at a time. For a short excerpt of a bounded set (the agents using one
   * model), where paging through would be more clicks than reading.
   */
  revealAll?: boolean;
  children: (visible: T[]) => ReactNode;
};

/**
 * Renders the first few items and reveals the rest a page at a time — a list
 * of hundreds of rows is a page nobody scrolls, and one click that drops all
 * of them in trades a long list for a longer one. The count of what is hidden
 * stays visible, so the button says what it costs, and *Show fewer* takes the
 * list back to its first page. Searching, not scrolling, is how a specific
 * tool is found; the lists that need it carry a search field above them.
 * With `revealAll`, one click shows the whole list (`Show all 40 agents`).
 * In both modes a remainder too small to be worth a click
 * ({@link showMoreSlack}) is shown with the page before it instead.
 */
export function ShowMore<T>({
  items,
  initial = INITIAL_ROWS,
  initialShown,
  noun,
  plural,
  revealAll = false,
  children,
}: ShowMoreProps<T>) {
  const [shown, setShown] = useState(() =>
    Math.max(initial, initialShown ?? 0),
  );
  const slack = showMoreSlack(initial);
  // How many a page of `count` actually renders: all of them once no more
  // than the slack would stay hidden.
  const pageOf = (count: number) =>
    items.length - count <= slack
      ? items.length
      : Math.min(count, items.length);
  const visible = items.slice(0, pageOf(shown));
  const hidden = items.length - visible.length;
  const nextPage = pageOf(shown + initial) - visible.length;
  // `shown` is sticky, so a list that shrinks under it (a search narrowing the
  // bucket) would otherwise keep offering *Show fewer* with nothing to fold
  // away. What is actually rendered decides — against the first page as it
  // renders, so a list shown whole for its slack offers nothing to fold.
  const isExpanded = visible.length > pageOf(initial);

  return (
    <Flex direction="column" gap="2">
      {children(visible)}
      {(hidden > 0 || isExpanded) && (
        // Wraps: "Show 20 more connectors", "Show fewer" and the tally are
        // ~415px together, wider than a phone's 343px of content.
        <Flex
          align="center"
          gap="2"
          style={{ flexWrap: 'wrap', rowGap: 'var(--bui-space-1)' }}
        >
          {hidden > 0 && (
            <Button
              variant="tertiary"
              size="small"
              onPress={() =>
                setShown(count =>
                  revealAll ? Number.POSITIVE_INFINITY : count + initial,
                )
              }
            >
              {revealAll
                ? `Show all ${countNoun(items.length, noun, plural)}`
                : `Show ${countNoun(
                    nextPage,
                    `more ${noun}`,
                    `more ${plural ?? `${noun}s`}`,
                  )}`}
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
          {/* `Show all N` already says the total; the tally is for paging. */}
          {!revealAll && (
            <Text variant="body-x-small" color="secondary">
              {countNoun(visible.length, noun, plural)} shown
              {hidden > 0 ? `, ${hidden} more` : ''}
            </Text>
          )}
        </Flex>
      )}
    </Flex>
  );
}
