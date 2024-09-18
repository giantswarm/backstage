/**
 * EntityCheckboxesPicker component is based on the EntityAutocompletePicker.tsx - https://github.com/backstage/backstage/blob/62c80557b638946f4c01569b5ede4338cb517543/plugins/catalog-react/src/components/EntityAutocompletePicker/EntityAutocompletePicker.tsx
 */

import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  catalogApiRef,
  DefaultEntityFilters,
  EntityFilter,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  Typography,
} from '@material-ui/core';
import useAsync from 'react-use/esm/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { CustomFilters, reduceBackendCatalogFilters } from '../filters';

export type AllowedEntityFilters<T extends CustomFilters> = {
  [K in keyof T]-?: NonNullable<T[K]> extends EntityFilter & {
    values: string[];
  }
    ? K
    : never;
}[keyof T];

type EntityCheckboxesPickerProps<
  T extends DefaultEntityFilters = CustomFilters,
  Name extends AllowedEntityFilters<T> = AllowedEntityFilters<T>,
> = {
  label: string;
  name: Name;
  path: string;
  Filter: { new (values: string[]): NonNullable<T[Name]> };
  initialSelectedOptions?: string[];
  filtersForAvailableValues?: Array<keyof T>;
  optionsOrder?: string[];
  renderOption?: (option: string) => ReactNode;
};

export function EntityCheckboxesPicker<
  T extends DefaultEntityFilters = CustomFilters,
  Name extends AllowedEntityFilters<T> = AllowedEntityFilters<T>,
>(props: EntityCheckboxesPickerProps<T, Name>) {
  const {
    label,
    name,
    path,
    Filter,
    initialSelectedOptions = [],
    filtersForAvailableValues = ['kind'],
    optionsOrder,
    renderOption,
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

  const [selectedOptions, setSelectedOptions] = useState(
    queryParameters.length
      ? queryParameters
      : ((filters[name] as unknown as { values: string[] })?.values ??
          initialSelectedOptions),
  );

  useEffect(() => {
    if (queryParameters.length) {
      setSelectedOptions(queryParameters);
    }
  }, [queryParameters]);

  const availableOptions = Object.keys(availableValues ?? {}).sort((a, b) => {
    const aIndex = optionsOrder?.indexOf(a) ?? -1;
    const bIndex = optionsOrder?.indexOf(b) ?? -1;

    return aIndex - bIndex;
  });
  const shouldAddFilter = selectedOptions.length && availableOptions.length;

  useEffect(() => {
    updateFilters({
      [name]: shouldAddFilter ? new Filter(selectedOptions) : undefined,
    } as Partial<T>);
  }, [name, shouldAddFilter, selectedOptions, Filter, updateFilters]);

  const filter = filters[name];
  if (
    (filter && typeof filter === 'object' && !('values' in filter)) ||
    !availableOptions.length
  ) {
    return null;
  }

  return (
    <Box pb={1} pt={1}>
      <FormControl component="fieldset">
        <Typography variant="button">{label}</Typography>
        <FormGroup>
          {availableOptions.map(option => (
            <FormControlLabel
              key={option}
              control={
                <Checkbox
                  checked={selectedOptions.includes(option)}
                  onChange={() => {
                    const newSelectedOptions = selectedOptions.includes(option)
                      ? selectedOptions.filter(
                          selectedOption => selectedOption !== option,
                        )
                      : [...selectedOptions, option];
                    setSelectedOptions(newSelectedOptions);
                  }}
                />
              }
              label={renderOption ? renderOption(option) : option}
            />
          ))}
        </FormGroup>
      </FormControl>
    </Box>
  );
}
