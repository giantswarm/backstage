import { Box } from '@material-ui/core';
import { SingleSelect } from '@giantswarm/backstage-plugin-ui-react';
import { useFluxOverviewData } from '@giantswarm/backstage-plugin-flux-react';

export const ResourceTypePicker = () => {
  const { resourceType, setResourceType } = useFluxOverviewData();
  const options = [
    { label: 'All', value: 'all' },
    { label: 'Flux', value: 'flux' },
  ];

  const handleChange = (selectedValue: string | null) => {
    setResourceType(selectedValue as 'all' | 'flux');
  };

  const selected = resourceType;

  return (
    <Box pb={1} pt={1}>
      <SingleSelect
        label="Type of resource"
        items={options}
        selected={selected}
        onChange={handleChange}
      />
    </Box>
  );
};
