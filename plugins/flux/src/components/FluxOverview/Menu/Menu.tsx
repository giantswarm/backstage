import { ClusterSelector } from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';

type MenuProps = {
  clusters: string[];
  selectedCluster: string | null;
  onSelectedClusterChange: (selectedCluster: string | null) => void;
  compactView: boolean;
  onCompactViewChange: () => void;
};

export const Menu = ({
  clusters,
  selectedCluster,
  onSelectedClusterChange,
}: MenuProps) => {
  return (
    <Box mb={4}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <ClusterSelector
            clusters={clusters}
            selectedCluster={selectedCluster}
            onChange={onSelectedClusterChange}
          />
        </Grid>
      </Grid>
    </Box>
  );
};
