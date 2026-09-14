import { ReactNode, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  group: {
    // bui's accordion trigger has no bottom padding; an expanded header would
    // sit flush against its panel. The selector must reach the button, which
    // is what carries `aria-expanded` (see ui-react's SimpleAccordion).
    '& .bui-AccordionTriggerButton[aria-expanded="true"]': {
      paddingBottom: theme.spacing(1),
    },
  },
  nested: {
    borderLeft: `2px solid ${theme.palette.divider}`,
    paddingLeft: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    paddingBottom: theme.spacing(1),
  },
}));

/**
 * Controlled expansion, re-seeded on the search: collapsed while nothing is
 * searched — a gateway lists hundreds of tools, and neither the catalogue nor
 * a resolution of it is something anyone reads top to bottom — and every
 * visible entry open while a query is active, because a search must reveal its
 * matches. Within a stable query and set of entries, what the reader toggles
 * sticks.
 *
 * `defaultExpanded` opens everything while nothing is searched, for the short
 * list where collapsing would only hide what already fits.
 */
export function useSearchExpansion(
  keys: string[],
  query: string,
  defaultExpanded = false,
): [Set<string>, (next: Set<string>) => void] {
  const signature = keys.join('|');
  // Seeded with what the effect below would set anyway: a nested stack mounted
  // by a query-driven parent expansion is opened on its first render rather
  // than in a second commit.
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(defaultExpanded || query !== '' ? keys : []),
  );
  useEffect(() => {
    setExpanded(new Set(query === '' && !defaultExpanded ? [] : keys));
    // signature stands in for keys (a new array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, signature, defaultExpanded]);
  return [expanded, setExpanded];
}

export type DisclosureEntry = {
  key: string;
  trigger: ReactNode;
  /** Rendered only while expanded, so a collapsed group costs no rows. */
  panel: () => ReactNode;
};

export type DisclosuresProps = {
  entries: DisclosureEntry[];
  /** The active search term, for expansion re-seeding. */
  query: string;
  /** Indents and rules the stack, for a level below the top one. */
  nested?: boolean;
  /** Start open rather than collapsed — see {@link useSearchExpansion}. */
  defaultExpanded?: boolean;
  /**
   * Names the stack for assistive technology. Two of these can sit on one page
   * over the same catalogue — the Tools step has one to pick from and one
   * showing what was picked — and their triggers then carry identical
   * accessible names. Without a name on the group, nothing but document order
   * tells them apart.
   */
  ariaLabel?: string;
};

/** A stack of collapsible entries whose expansion follows the search. */
export function Disclosures({
  entries,
  query,
  nested = false,
  defaultExpanded = false,
  ariaLabel,
}: DisclosuresProps) {
  const classes = useStyles();
  const [expanded, setExpanded] = useSearchExpansion(
    entries.map(entry => entry.key),
    query,
    defaultExpanded,
  );
  const group = (
    <AccordionGroup
      allowsMultiple
      expandedKeys={expanded}
      onExpandedChange={next => setExpanded(new Set(next as Set<string>))}
      className={`${classes.group} ${nested ? classes.nested : ''}`}
    >
      {entries.map(entry => (
        <Accordion id={entry.key} key={entry.key}>
          <AccordionTrigger>{entry.trigger}</AccordionTrigger>
          <AccordionPanel>
            {expanded.has(entry.key) ? (
              <div className={classes.panel}>{entry.panel()}</div>
            ) : null}
          </AccordionPanel>
        </Accordion>
      ))}
    </AccordionGroup>
  );
  // bui's AccordionGroup renders a bare div, so an aria-label on it would name
  // nothing. The role is what makes the name reachable.
  return ariaLabel ? (
    <div role="group" aria-label={ariaLabel}>
      {group}
    </div>
  ) : (
    group
  );
}
