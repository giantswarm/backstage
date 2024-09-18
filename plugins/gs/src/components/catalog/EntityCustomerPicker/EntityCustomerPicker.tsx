import { Select } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import Box from '@material-ui/core/Box';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CustomFilters,
  EntityCustomerFilter,
  reduceBackendCatalogFilters,
} from '../filters';
import {
  catalogApiRef,
  EntityFilter,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import useAsync from 'react-use/esm/useAsync';

export interface EntityCustomerPickerProps {
  initialSelectedOption?: string;
  filtersForAvailableValues?: Array<keyof CustomFilters>;
}

export const EntityCustomerPicker = (props: EntityCustomerPickerProps) => {
  const { initialSelectedOption = '', filtersForAvailableValues = ['kind'] } =
    props;

  const {
    updateFilters,
    filters,
    queryParameters: { customer: queryParameter },
  } = useEntityList<CustomFilters>();

  const catalogApi = useApi(catalogApiRef);
  const availableValuesFilters = filtersForAvailableValues.map(
    f => filters[f] as EntityFilter | undefined,
  );

  const { value: availableValues } = useAsync(async () => {
    const facet = 'metadata.labels.giantswarm.io/customer';
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

  const initialSelectedOptions = initialSelectedOption
    ? [initialSelectedOption]
    : [];
  const [selectedOptions, setSelectedOptions] = useState(
    queryParameters.length
      ? queryParameters
      : (filters.customer?.getCustomers() ?? initialSelectedOptions),
  );

  useEffect(() => {
    if (queryParameters.length) {
      setSelectedOptions(queryParameters);
    }
  }, [queryParameters]);

  const availableOptions = Object.keys(availableValues ?? {});
  const shouldAddFilter = selectedOptions.length && availableOptions.length;

  useEffect(() => {
    updateFilters({
      customer: shouldAddFilter
        ? new EntityCustomerFilter(selectedOptions)
        : undefined,
    } as Partial<CustomFilters>);
  }, [shouldAddFilter, selectedOptions, updateFilters]);

  const filter = filters.customer;
  if (
    (filter && typeof filter === 'object' && !('value' in filter)) ||
    !availableOptions.length
  ) {
    return null;
  }

  const items = [
    { value: 'all', label: 'all' },
    ...availableOptions.map(option => ({
      value: option,
      label: option,
    })),
  ];

  return (
    <Box pb={1} pt={1}>
      <Select
        label="Customer"
        items={items}
        selected={(items.length > 1 ? selectedOptions[0] : undefined) ?? 'all'}
        onChange={value =>
          setSelectedOptions(value === 'all' ? [] : [String(value)])
        }
      />
    </Box>
  );
};
