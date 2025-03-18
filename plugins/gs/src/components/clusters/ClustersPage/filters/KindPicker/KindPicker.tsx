import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@material-ui/core';
import { MultipleSelect } from '../../../../UI/MultipleSelect';
import { useClustersData } from '../../../ClustersDataProvider';
import { KindFilter } from '../filters';
import { isManagementCluster } from '@giantswarm/backstage-plugin-gs-common';

const defaultItems = [
  { value: 'mc', label: 'Management Cluster' },
  { value: 'wc', label: 'Workload Cluster' },
];

export const KindPicker = () => {
  const {
    resources,
    filters,
    queryParameters: { kind: queryParameterKind },
    updateFilters,
    isLoading,
  } = useClustersData();

  const kindOptions = useMemo(() => {
    return new Map(
      resources
        .map(({ installationName, ...cluster }) => {
          let kind = 'wc';
          let label = 'Workload Cluster';
          if (isManagementCluster(cluster, installationName)) {
            kind = 'mc';
            label = 'Management Cluster';
          }

          return [kind, label];
        })
        .filter(item => Boolean(item)) as [string, string][],
    );
  }, [resources]);

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
        <MultipleSelect label="Type" items={defaultItems} disabled />
      ) : (
        <MultipleSelect
          label="Type"
          items={items}
          selected={value}
          onChange={selectedItems => setValue(selectedItems)}
        />
      )}
    </Box>
  );
};
