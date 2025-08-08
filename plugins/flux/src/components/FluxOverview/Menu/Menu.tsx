import { ClusterSelector } from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
import { CompactViewSwitch } from './CompactViewSwitch';

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
  compactView,
  onCompactViewChange,
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
        {Boolean(selectedCluster) ? (
          <Grid item xs={12} md={9}>
            <Box mt={{ md: '27px' }}>
              <CompactViewSwitch
                value={compactView}
                onChange={onCompactViewChange}
              />
            </Box>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
};
