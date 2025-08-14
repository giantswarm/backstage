import { SingleClusterSelector } from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { CompactViewSwitch } from './CompactViewSwitch';

type MenuProps = {
  onSelectedClusterChange: (selectedCluster: string | null) => void;
  compactView: boolean;
  onCompactViewChange: () => void;
};

export const Menu = ({
  onSelectedClusterChange,
  compactView,
  onCompactViewChange,
}: MenuProps) => {
  return (
    <Box mb={3}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <SingleClusterSelector onChange={onSelectedClusterChange} />
        </Grid>
        <Grid item xs={12} md={9}>
          <Box mt={{ md: '27px' }}>
            <CompactViewSwitch
              value={compactView}
              onChange={onCompactViewChange}
            />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};
