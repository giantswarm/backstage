import { MultiplePicker } from '@giantswarm/backstage-plugin-ui-react';
import { StatusFilter, STATUS_VALID, STATUS_WARNING } from '../filters';
import { useWorkflowsData } from '../../WorkflowsDataProvider';

const TITLE = 'Status';

const OPTIONS = [
  { value: STATUS_VALID, label: 'Valid' },
  { value: STATUS_WARNING, label: 'Validation warning' },
];

export const StatusPicker = () => {
  const {
    updateFilters,
    filters,
    queryParameters: { status: queryParameter },
  } = useWorkflowsData();

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      status: new StatusFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.status?.values}
      options={OPTIONS}
      onSelect={handleSelect}
    />
  );
};
