import { Box } from '@material-ui/core';
import { SingleSelect } from '@giantswarm/backstage-plugin-ui-react';
import { useFluxOverviewData } from '../../../FluxOverviewDataProvider';

export const StatusPicker = () => {
  const { statusFilter, setStatusFilter } = useFluxOverviewData();
  const options = [
    { label: 'All', value: 'all' },
    { label: 'Failing only', value: 'failing' },
  ];

  const handleChange = (selectedValue: string | null) => {
    setStatusFilter(selectedValue as 'all' | 'failing');
  };

  return (
    <Box pb={1} pt={1}>
      <SingleSelect
        label="Status"
        items={options}
        selected={statusFilter}
        onChange={handleChange}
      />
    </Box>
  );
};
