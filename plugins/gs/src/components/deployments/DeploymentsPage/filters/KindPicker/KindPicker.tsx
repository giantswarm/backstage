import React, { useMemo } from 'react';
import uniqBy from 'lodash/uniqBy';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { KindFilter } from '../filters';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';

export const APP_VALUE = 'app';
export const HELM_RELEASE_VALUE = 'helmrelease';

const APP_LABEL = 'Giant Swarm App';
const HELM_RELEASE_LABEL = 'Flux HelmRelease';

const TITLE = 'Deployment type';

function formatOption(item: DeploymentData): MultiplePickerOption | undefined {
  const label = item.kind === APP_VALUE ? APP_LABEL : HELM_RELEASE_LABEL;
  const value = item.kind;

  return { value, label };
}

export const KindPicker = () => {
  const {
    data,
    filters,
    queryParameters: { kind: queryParameter },
    updateFilters,
  } = useDeploymentsData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value');
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      kind: new KindFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.kind?.values}
      options={options}
      onSelect={handleSelect}
    />
  );
};
