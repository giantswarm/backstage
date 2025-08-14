import {
  SingleClusterSelector,
  ClustersSelector,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { CompactViewSwitch } from './CompactViewSwitch';

type MenuProps = {
  // clusters: string[];
  // selectedCluster: string | null;
  onSelectedClusterChange: (selectedCluster: string | null) => void;
  // selectedClusters: string[];
  // onSelectedClustersChange: (selectedClusters: string[]) => void;
  compactView: boolean;
  onCompactViewChange: () => void;
};

export const Menu = ({
  // clusters,
  // selectedCluster,
  onSelectedClusterChange,
  // selectedClusters,
  // onSelectedClustersChange,
  compactView,
  onCompactViewChange,
}: MenuProps) => {
  return (
    <Box mb={3}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <SingleClusterSelector onChange={onSelectedClusterChange} />
        </Grid>
        {/* <Grid item xs={12} md={3}>
          <ClustersSelector
            clusters={clusters}
            selectedClusters={selectedClusters}
            onChange={onSelectedClustersChange}
          />
        </Grid> */}
        {/* {Boolean(selectedCluster) ? ( */}
        <Grid item xs={12} md={9}>
          <Box mt={{ md: '27px' }}>
            <CompactViewSwitch
              value={compactView}
              onChange={onCompactViewChange}
            />
          </Box>
        </Grid>
        {/* ) : null} */}
      </Grid>
    </Box>
  );
};
