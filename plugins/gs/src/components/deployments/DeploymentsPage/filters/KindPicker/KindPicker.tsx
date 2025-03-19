import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@material-ui/core';
import { MultipleSelect } from '../../../../UI/MultipleSelect';
import { useDeploymentsData } from '../../../DeploymentsDataProvider';
import { KindFilter } from '../filters';

export const APP_VALUE = 'app';
export const HELM_RELEASE_VALUE = 'helmrelease';

const APP_LABEL = 'Giant Swarm App';
const HELM_RELEASE_LABEL = 'Flux HelmRelease';

const TITLE = 'Deployment type';

const defaultItems = [
  { value: APP_VALUE, label: APP_LABEL },
  { value: HELM_RELEASE_VALUE, label: HELM_RELEASE_LABEL },
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
            item.kind === APP_VALUE ? APP_LABEL : HELM_RELEASE_LABEL,
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
