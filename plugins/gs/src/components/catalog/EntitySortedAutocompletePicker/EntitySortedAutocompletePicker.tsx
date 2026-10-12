/**
 * EntitySortedAutocompletePicker component is based on the EntityAutocompletePicker.tsx - https://github.com/backstage/backstage/blob/62c80557b638946f4c01569b5ede4338cb517543/plugins/catalog-react/src/components/EntityAutocompletePicker/EntityAutocompletePicker.tsx
 *
 * It renders the same dropdown as the upstream facets next to it, and adds
 * `compareOptions`: the catalog returns facet values in text order, which
 * reads 10.1.0, 10.10.0, 10.2.0 for a list of versions.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AllowedEntityFilters,
  CatalogAutocomplete,
  catalogApiRef,
  DefaultEntityFilters,
  EntityFilter,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import { useApi } from '@backstage/core-plugin-api';
// The upstream picker's option row, which is not exported.
import { Box, Checkbox, FormControlLabel } from '@material-ui/core';
import CheckBoxIcon from '@material-ui/icons/CheckBox';
import CheckBoxOutlineBlankIcon from '@material-ui/icons/CheckBoxOutlineBlank';
import useAsync from 'react-use/esm/useAsync';
import { isEqual } from 'lodash';
import { CustomFilters, reduceBackendCatalogFilters } from '../filters';

type EntitySortedAutocompletePickerProps<
  T extends DefaultEntityFilters = CustomFilters,
  Name extends AllowedEntityFilters<T> = AllowedEntityFilters<T>,
> = {
  label: string;
  name: Name;
  path: string;
  Filter: { new (values: string[]): NonNullable<T[Name]> };
  compareOptions: (a: string, b: string) => number;
  initialSelectedOptions?: string[];
  filtersForAvailableValues?: Array<keyof T>;
};

export function EntitySortedAutocompletePicker<
  T extends DefaultEntityFilters = CustomFilters,
  Name extends AllowedEntityFilters<T> = AllowedEntityFilters<T>,
>(props: EntitySortedAutocompletePickerProps<T, Name>) {
  const {
    label,
    name,
    path,
    Filter,
    compareOptions,
    initialSelectedOptions = [],
    filtersForAvailableValues = ['kind'],
  } = props;

  const {
    updateFilters,
    filters,
    queryParameters: { [name]: queryParameter },
  } = useEntityList<T>();

  const catalogApi = useApi(catalogApiRef);
  const availableValuesFilters = filtersForAvailableValues.map(
    f => filters[f] as EntityFilter | undefined,
  );

  const { value: availableValues } = useAsync(async () => {
    const facet = path;
    const { facets } = await catalogApi.getEntityFacets({
      facets: [facet],
      filter: reduceBackendCatalogFilters(
        availableValuesFilters.filter(Boolean) as EntityFilter[],
      ),
    });

    return Object.fromEntries(
      facets[facet].map(({ value, count }) => [value, count]),
    );
  }, [...availableValuesFilters]);

  const queryParameters = useMemo(
    () => [queryParameter].flat().filter(Boolean) as string[],
    [queryParameter],
  );

  const filteredOptions = (filters[name] as unknown as { values?: string[] })
    ?.values;
  const [selectedOptions, setSelectedOptions] = useState(
    queryParameters.length
      ? queryParameters
      : (filteredOptions ?? initialSelectedOptions),
  );

  useEffect(() => {
    if (queryParameters.length) {
      setSelectedOptions(queryParameters);
    }
  }, [queryParameters]);

  const availableOptions = useMemo(
    () => Object.keys(availableValues ?? {}).sort(compareOptions),
    [availableValues, compareOptions],
  );
  const shouldAddFilter = selectedOptions.length && availableOptions.length;

  useEffect(() => {
    updateFilters({
      [name]: shouldAddFilter ? new Filter(selectedOptions) : undefined,
    } as Partial<T>);
  }, [name, shouldAddFilter, selectedOptions, Filter, updateFilters]);

  useEffect(() => {
    if (!shouldAddFilter) return;
    const newSelectedOptions = filteredOptions ?? [];
    if (!isEqual(newSelectedOptions, selectedOptions)) {
      setSelectedOptions(newSelectedOptions);
    }
    // Mirrors upstream: only an outside change to the filter resyncs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOptions]);

  const filter = filters[name];
  if (
    (filter && typeof filter === 'object' && !('values' in filter)) ||
    !availableOptions.length
  ) {
    return null;
  }

  return (
    <Box pb={1} pt={1}>
      <CatalogAutocomplete<string, true>
        multiple
        disableCloseOnSelect
        label={label}
        name={`${String(name)}-picker`}
        options={availableOptions}
        value={selectedOptions}
        onChange={(_event, options) => setSelectedOptions(options)}
        renderOption={(option, { selected }) => (
          <FormControlLabel
            control={
              <Checkbox
                icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                checkedIcon={<CheckBoxIcon fontSize="small" />}
                checked={selected}
              />
            }
            label={option}
            onClick={event => event.preventDefault()}
          />
        )}
      />
    </Box>
  );
}
