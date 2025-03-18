import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@material-ui/core';
import { MultipleSelect } from '../../../../UI/MultipleSelect';
import { useDeploymentsData } from '../../../DeploymentsDataProvider';
import { KindFilter } from '../filters';

const defaultItems = [
  { value: 'app', label: 'Giant Swarm App' },
  { value: 'helmrelease', label: 'Flux HelmRelease' },
];

export const KindPicker = () => {
  const {
    data,
    filters,
    queryParameters: { kind: queryParameterKind },
    updateFilters,
    isLoading,
  } = useDeploymentsData();

  const kindOptions = useMemo(() => {
    return new Map(
      data
        .map(item => {
          return [
            item.kind,
            item.kind === 'app' ? 'Giant Swarm App' : 'Flux HelmRelease',
          ];
        })
        .filter(item => Boolean(item)) as [string, string][],
    );
  }, [data]);

  const queryParameter = useMemo(
    () => [queryParameterKind].flat().filter(Boolean) as string[],
    [queryParameterKind],
  );

  const [value, setValue] = useState(queryParameter ?? filters.kind?.value);

  useEffect(() => {
    if (value.some(valueItem => !kindOptions.has(valueItem))) {
      setValue([]);
    }
  }, [kindOptions, value]);

  useEffect(() => {
    if (queryParameter) {
      setValue(queryParameter);
    }
  }, [queryParameter]);

  useEffect(() => {
    if (filters.kind?.value) {
      setValue(filters.kind?.value);
    }
  }, [filters.kind]);

  useEffect(() => {
    updateFilters({
      kind: value ? new KindFilter(value) : undefined,
    });
  }, [value, updateFilters]);

  const items = [...kindOptions.entries()].map(([key, label]) => ({
    label,
    value: key,
  }));

  return (
    <Box pb={1} pt={1}>
      {isLoading || items.length === 0 ? (
        <MultipleSelect label="Deployment type" items={defaultItems} disabled />
      ) : (
        <MultipleSelect
          label="Deployment type"
          items={items}
          selected={value}
          onChange={selectedItems => setValue(selectedItems)}
        />
      )}
    </Box>
  );
};
