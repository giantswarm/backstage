import { useMemo } from 'react';
import uniqBy from 'lodash/uniqBy';
import {
  MultiplePicker,
  MultiplePickerOption,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  FluxResourceData,
  useFluxResourcesData,
} from '../../../FluxResourcesDataProvider';
import { KindFilter } from '../filters';

const TITLE = 'Flux resource kind';

function formatOption(
  item: FluxResourceData,
): MultiplePickerOption | undefined {
  const label = item.kind;
  const value = item.kind;

  return { value, label };
}

export const KindPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { kind: queryParameter },
  } = useFluxResourcesData();

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
      autocomplete
    />
  );
};
