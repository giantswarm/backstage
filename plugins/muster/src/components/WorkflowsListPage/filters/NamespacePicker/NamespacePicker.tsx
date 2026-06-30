import { useMemo } from 'react';
import {
  MultiplePicker,
  MultiplePickerOption,
} from '@giantswarm/backstage-plugin-ui-react';
import uniqBy from 'lodash/uniqBy';
import { NamespaceFilter } from '../filters';
import { WorkflowRow, useWorkflowsData } from '../../WorkflowsDataProvider';

const TITLE = 'Namespace';

function formatOption(item: WorkflowRow): MultiplePickerOption | undefined {
  if (!item.namespace) {
    return undefined;
  }

  return { value: item.namespace, label: item.namespace };
}

export const NamespacePicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { namespace: queryParameter },
  } = useWorkflowsData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value').sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      namespace: new NamespaceFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.namespace?.values}
      options={options}
      onSelect={handleSelect}
      autocomplete
    />
  );
};
