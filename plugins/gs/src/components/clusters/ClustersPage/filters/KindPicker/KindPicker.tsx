import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@material-ui/core';
import { MultipleSelect } from '../../../../UI/MultipleSelect';
import { useClustersData } from '../../../ClustersDataProvider';
import { KindFilter } from '../filters';
import { ClusterTypes } from '../../../utils';

export const MC_VALUE = 'mc';
export const WC_VALUE = 'wc';

const MC_LABEL = 'Management Cluster (MC)';
const WC_LABEL = 'Workload Cluster (WC)';

const TITLE = 'Type';

const defaultItems = [
  { value: MC_VALUE, label: MC_LABEL },
  { value: WC_VALUE, label: WC_LABEL },
];

export const KindPicker = () => {
  const {
    data,
    filters,
    queryParameters: { kind: queryParameterKind },
    updateFilters,
    isLoading,
  } = useClustersData();

  const kindOptions = useMemo(() => {
    return new Map(
      data
        .map(item => {
          let kind = WC_VALUE;
          let label = WC_LABEL;
          if (item.type === ClusterTypes.Management) {
            kind = MC_VALUE;
            label = MC_LABEL;
          }

          return [kind, label];
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
        <MultipleSelect label={TITLE} items={defaultItems} disabled />
      ) : (
        <MultipleSelect
          label={TITLE}
          items={items}
          selected={value}
          onChange={selectedItems => setValue(selectedItems)}
        />
      )}
    </Box>
  );
};
