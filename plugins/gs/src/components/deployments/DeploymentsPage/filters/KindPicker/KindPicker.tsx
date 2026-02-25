import { useMemo } from 'react';
import uniqBy from 'lodash/uniqBy';
import {
  MultiplePicker,
  MultiplePickerOption,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { KindFilter } from '../filters';

export const APP_VALUE = 'app';
export const HELM_RELEASE_VALUE = 'helmrelease';
export const DEPLOYMENT_VALUE = 'deployment';
export const STATEFULSET_VALUE = 'statefulset';
export const DAEMONSET_VALUE = 'daemonset';

const KIND_LABELS: Record<string, string> = {
  [APP_VALUE]: 'Giant Swarm App',
  [HELM_RELEASE_VALUE]: 'Flux HelmRelease',
  [DEPLOYMENT_VALUE]: 'Deployment',
  [STATEFULSET_VALUE]: 'StatefulSet',
  [DAEMONSET_VALUE]: 'DaemonSet',
};

const TITLE = 'Deployment type';

function formatOption(item: DeploymentData): MultiplePickerOption | undefined {
  const label = KIND_LABELS[item.kind] ?? item.kind;
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
