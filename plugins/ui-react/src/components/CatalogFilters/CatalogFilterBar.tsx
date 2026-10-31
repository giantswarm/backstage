import type { CSSProperties } from 'react';
import { Button, Flex, Select, SelectItem, Text } from '@backstage/ui';
import { searchableIf } from '../../utils/searchableIf';
import type {
  CatalogFilterDimension,
  CatalogFilterOption,
} from './catalogFilters';

/**
 * A dropdown takes its share of the row and wraps to the next one before it
 * gets narrower than 10rem: side by side on a desktop, two to a row on a
 * phone, never wider than a field name and two picks need. bui's Select
 * otherwise stretches to the whole row.
 */
const DROPDOWN_STYLE: CSSProperties = {
  flex: '1 1 10rem',
  width: 'auto',
  minWidth: 0,
  maxWidth: '16rem',
};

/** The field name inside the trigger, before what is picked. */
const FIELD_NAME_STYLE: CSSProperties = {
  flexShrink: 0,
  whiteSpace: 'nowrap',
  color: 'var(--bui-fg-secondary)',
  fontSize: 'var(--bui-font-size-3)',
};

const OPTION_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--bui-space-3)',
  minWidth: 0,
};

const OPTION_LABEL_STYLE: CSSProperties = {
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const OPTION_COUNT_STYLE: CSSProperties = {
  flexShrink: 0,
  color: 'var(--bui-fg-secondary)',
  fontVariantNumeric: 'tabular-nums',
};

export type CatalogFilterBarProps = {
  dimensions: CatalogFilterDimension[];
  /** A facet's new picks; an empty list picks every value of it again. */
  onSelect: (facetId: string, values: string[]) => void;
  /**
   * Clears every facet's picks. Given, the bar offers "Clear filters" while
   * anything is picked.
   */
  onClear?: () => void;
};

function FilterDropdown({
  dimension,
  onSelect,
}: {
  dimension: CatalogFilterDimension;
  onSelect: CatalogFilterBarProps['onSelect'];
}) {
  const field = dimension.label.toLowerCase();
  const picked = dimension.selected.length;
  return (
    <Select<'multiple', CatalogFilterOption>
      aria-label={`Filter by ${field}`}
      size="small"
      selectionMode="multiple"
      placeholder="All"
      // The trigger reads "Source  All", "Source  acme/skills", or with more
      // picks "Source 3  acme/skills, gs/skills, and …" (react-aria's list
      // format, cut off with an ellipsis). Named for assistive technology by
      // aria-label and the picks themselves.
      icon={
        <span aria-hidden style={FIELD_NAME_STYLE}>
          {picked > 1 ? `${dimension.label} ${picked}` : dimension.label}
        </span>
      }
      items={dimension.options}
      dependencies={[dimension.options]}
      value={dimension.selected}
      onChange={keys => onSelect(dimension.id, [...keys].map(String))}
      search={
        searchableIf(dimension.options)
          ? { placeholder: `Search ${field}` }
          : undefined
      }
      style={DROPDOWN_STYLE}
    >
      {option => (
        <SelectItem
          id={option.id}
          textValue={option.label}
          showSelectionIndicator
        >
          {/* Read as "acme/skills 31": the space is collapsed in the row. */}
          <span style={OPTION_STYLE}>
            <span style={OPTION_LABEL_STYLE}>{option.label}</span>{' '}
            <span style={OPTION_COUNT_STYLE}>{option.count}</span>
          </span>
        </SelectItem>
      )}
    </Select>
  );
}

/**
 * A catalog's filters under its search: one multi-select dropdown per facet,
 * named by its field and listing the facet's values with what each keeps
 * ("acme/skills 31"). Picks within a dropdown widen (any of them), dropdowns
 * narrow each other. Only facets that can narrow the list are drawn
 * (`catalogFilterDimensions`); with none, the bar draws nothing. The
 * row wraps at phone width. State lives in {@link useCatalogFilters}.
 */
export function CatalogFilterBar({
  dimensions,
  onSelect,
  onClear,
}: CatalogFilterBarProps) {
  if (dimensions.length === 0) {
    return null;
  }
  const isFiltered = dimensions.some(
    dimension => dimension.selected.length > 0,
  );
  return (
    <Flex
      role="group"
      aria-label="Filters"
      align="center"
      gap="2"
      style={{ flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}
    >
      {dimensions.map(dimension => (
        <FilterDropdown
          key={dimension.id}
          dimension={dimension}
          onSelect={onSelect}
        />
      ))}
      {onClear && isFiltered && (
        <Button variant="tertiary" size="small" onPress={onClear}>
          Clear filters
        </Button>
      )}
    </Flex>
  );
}

export type CatalogNoMatchProps = {
  /** What the list holds, in the plural: "agents". */
  plural: string;
  search: string;
  /** Whether filters narrow the list too; a search-only list leaves it out. */
  isFiltered?: boolean;
  onClearFilters?: () => void;
};

/**
 * What an emptied catalog list says: which search and whether filters emptied
 * it, with the way back when they did. The search field lives above the list
 * and clears itself; the filters are cleared here.
 */
export function CatalogNoMatch({
  plural,
  search,
  isFiltered = false,
  onClearFilters,
}: CatalogNoMatchProps) {
  const term = search.trim();
  let message = `No ${plural} match these filters.`;
  if (term && isFiltered) {
    message = `No ${plural} match “${term}” with these filters.`;
  } else if (term) {
    message = `No ${plural} match “${term}”.`;
  }
  return (
    <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
      <Text as="p" variant="body-medium" color="secondary">
        {message}
      </Text>
      {isFiltered && onClearFilters && (
        <Button variant="secondary" size="small" onPress={onClearFilters}>
          Clear filters
        </Button>
      )}
    </Flex>
  );
}
