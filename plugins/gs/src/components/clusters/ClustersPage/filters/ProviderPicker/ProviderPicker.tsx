import { useMemo } from 'react';
import uniqBy from 'lodash/uniqBy';
import {
  MultiplePicker,
  MultiplePickerOption,
} from '@giantswarm/backstage-plugin-ui-react';
import { ClusterData, useClustersData } from '../../../ClustersDataProvider';
import { ProviderFilter } from '../filters';
import { formatClusterProvider } from '../../../utils';
import { useInstallations } from '../../../../hooks';

const TITLE = 'Provider';

function formatOption(item: ClusterData): MultiplePickerOption | undefined {
  if (!item.provider) {
    return undefined;
  }

  const value = item.provider;
  const label = formatClusterProvider(item.provider);

  return { value, label };
}

export const ProviderPicker = () => {
  const { installationsInfo } = useInstallations();
  const {
    data,
    filters,
    queryParameters: { provider: queryParameter },
    updateFilters,
  } = useClustersData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value').sort((itemA, itemB) => {
      return itemA.label.localeCompare(itemB.label);
    });
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      provider: new ProviderFilter(selectedValues),
    });
  };

  const availableProviders = new Set(
    installationsInfo.flatMap(installation => installation.providers),
  );
  if (availableProviders.size <= 1) {
    return null;
  }

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.provider?.values}
      options={options}
      onSelect={handleSelect}
    />
  );
};
