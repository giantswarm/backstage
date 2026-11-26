import { useMemo } from 'react';
import { Box, SearchField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  CatalogFilterBar,
  type CatalogFacet,
  type CatalogFilterSelection,
  type CatalogFilters,
  useCatalogFilters,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  TOOL_EFFECT_LABELS,
  type ToolEffect,
} from '../../../lib/toolAnnotations';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 8,
  },
  // A width cap, as the Resources and Prompts tabs' search has. The toolbar
  // is a column, so a flex basis here set the field's height: a tall empty
  // band between the search and the filter.
  search: {
    maxWidth: 360,
  },
});

/**
 * The "What it does" dropdown, as the wizard's catalogue draws it (T81).
 * `effectOf` says what an item does, or undefined for one that counts
 * nowhere (a blocked tool: muster lists none, so nothing is known of it).
 * One definition for the connector's Tools tab and the tool settings, so
 * the two offer the same filter.
 */
export function toolEffectFacet<T>(
  effectOf: (item: T) => ToolEffect | undefined,
): CatalogFacet<T> {
  return {
    id: 'effect',
    label: 'What it does',
    value: effectOf,
    optionLabel: id => TOOL_EFFECT_LABELS[id as ToolEffect] ?? id,
    order: ['reads', 'changes'],
  };
}

/**
 * A tool list's search and filters: what the search matches, then what the
 * picked filters keep of it. Display only: it narrows what a list shows and
 * never what a draft holds.
 */
export function useToolListFilter<T>({
  items,
  matches,
  facets,
  initialSelection,
}: {
  items: readonly T[];
  /** Whether an item answers the search; keep it stable (`useCallback`). */
  matches: (item: T) => boolean;
  /** Keep the array stable: a new one recomputes every count. */
  facets: readonly CatalogFacet<T>[];
  initialSelection?: CatalogFilterSelection;
}): {
  filters: CatalogFilters<T>;
  /** What the search and the filters leave. */
  shown: T[];
  /** Whether the list is narrowed by a search or a filter. */
  isNarrowed: boolean;
} {
  const searched = useMemo(() => items.filter(matches), [items, matches]);
  const filters = useCatalogFilters({
    items,
    searched,
    facets,
    initialSelection,
  });
  return {
    filters,
    shown: filters.filtered,
    isNarrowed: searched.length !== items.length || filters.isFiltered,
  };
}

/** The search field and the filter dropdowns above a tool list. */
export function ToolListToolbar<T>({
  query,
  onQueryChange,
  total,
  filters,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  /** How many tools the list holds, for the field's placeholder. */
  total: number;
  filters: CatalogFilters<T>;
}) {
  const classes = useStyles();
  return (
    <div className={classes.toolbar}>
      <Box className={classes.search}>
        <SearchField
          aria-label="Search tools"
          placeholder={`Search ${total} tools`}
          size="small"
          value={query}
          onChange={onQueryChange}
        />
      </Box>
      <CatalogFilterBar
        dimensions={filters.dimensions}
        onSelect={filters.select}
        onClear={filters.clear}
      />
    </div>
  );
}
