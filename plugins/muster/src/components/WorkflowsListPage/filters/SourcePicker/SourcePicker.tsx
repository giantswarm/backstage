import { MultiplePicker } from '@giantswarm/backstage-plugin-ui-react';
import { SourceFilter } from '../filters';
import { useWorkflowsData } from '../../WorkflowsDataProvider';

const TITLE = 'Source';

const OPTIONS = [
  { value: 'gitops', label: 'GitOps' },
  { value: 'manual', label: 'Manually added' },
];

export const SourcePicker = () => {
  const {
    updateFilters,
    filters,
    queryParameters: { source: queryParameter },
  } = useWorkflowsData();

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      source: new SourceFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.source?.values}
      options={OPTIONS}
      onSelect={handleSelect}
    />
  );
};
