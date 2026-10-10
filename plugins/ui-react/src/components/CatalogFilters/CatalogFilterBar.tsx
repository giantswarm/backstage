import {
  Button,
  Flex,
  Select,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { searchableIf } from '../../utils/searchableIf';
import {
  ALL_FILTER_VALUES,
  type CatalogFilterDimension,
  FILTER_CHIPS_CLASS_NAME,
  FILTER_CHIPS_MAX,
} from './catalogFilters';

export type CatalogFilterBarProps = {
  dimensions: CatalogFilterDimension[];
  /** A pick; `undefined` picks every value of the facet again. */
  onSelect: (facetId: string, value: string | undefined) => void;
};

function FilterDimension({
  dimension,
  onSelect,
}: {
  dimension: CatalogFilterDimension;
  onSelect: CatalogFilterBarProps['onSelect'];
}) {
  const pick = (key: unknown) => {
    const next = String(key);
    if (next === ALL_FILTER_VALUES) {
      onSelect(dimension.id, undefined);
    } else if (dimension.options.some(option => option.id === next)) {
      onSelect(dimension.id, next);
    }
  };
  const selected = dimension.value ?? ALL_FILTER_VALUES;
  const name = `Filter by ${dimension.label.toLowerCase()}`;

  return (
    <Flex align="center" gap="2" style={{ flexWrap: 'wrap', minWidth: 0 }}>
      {/* Named for assistive technology by the control's own label. */}
      <Text as="span" variant="body-small" color="secondary" aria-hidden>
        {dimension.label}
      </Text>
      {dimension.options.length <= FILTER_CHIPS_MAX ? (
        // The sessions list's chip idiom: single choice, never empty, each
        // chip with what it would leave.
        <ToggleButtonGroup
          className={FILTER_CHIPS_CLASS_NAME}
          aria-label={name}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[selected]}
          onSelectionChange={keys => {
            const [next] = [...keys];
            if (next !== undefined) {
              pick(next);
            }
          }}
        >
          <ToggleButton id={ALL_FILTER_VALUES} size="small">
            {`All ${dimension.total}`}
          </ToggleButton>
          {dimension.options.map(option => (
            <ToggleButton key={option.id} id={option.id} size="small">
              {`${option.label} ${option.count}`}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      ) : (
        <Select
          aria-label={name}
          size="small"
          searchable={searchableIf(dimension.options)}
          options={[
            { id: ALL_FILTER_VALUES, label: `All (${dimension.total})` },
            ...dimension.options.map(option => ({
              id: option.id,
              label: `${option.label} (${option.count})`,
            })),
          ]}
          selectedKey={selected}
          onSelectionChange={key => {
            if (key !== null) {
              pick(key);
            }
          }}
          style={{ minWidth: 200, maxWidth: 280 }}
        />
      )}
    </Flex>
  );
}

/**
 * A catalog's filters under its search, in the sessions list's chip idiom: a
 * row of chips per facet ("All 40", "acme/skills 31", "gs/skills 9"), or a
 * select once a facet has more than {@link FILTER_CHIPS_MAX} values. Draws
 * nothing when no facet would change the list — three entries get no filter
 * bar. State lives in {@link useCatalogFilters}.
 */
export function CatalogFilterBar({
  dimensions,
  onSelect,
}: CatalogFilterBarProps) {
  if (dimensions.length === 0) {
    return null;
  }
  return (
    <Flex
      role="group"
      aria-label="Filters"
      align="center"
      gap="4"
      style={{ flexWrap: 'wrap', rowGap: 'var(--bui-space-2)' }}
    >
      {dimensions.map(dimension => (
        <FilterDimension
          key={dimension.id}
          dimension={dimension}
          onSelect={onSelect}
        />
      ))}
    </Flex>
  );
}

export type CatalogNoMatchProps = {
  /** What the list holds, in the plural: "agents". */
  plural: string;
  search: string;
  isFiltered: boolean;
  onClearFilters: () => void;
};

/**
 * What an emptied catalog list says: which search and whether filters emptied
 * it, with the way back when they did. The search field lives above the list
 * and clears itself; the filters are cleared here.
 */
export function CatalogNoMatch({
  plural,
  search,
  isFiltered,
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
      {isFiltered && (
        <Button variant="secondary" size="small" onPress={onClearFilters}>
          Clear filters
        </Button>
      )}
    </Flex>
  );
}
