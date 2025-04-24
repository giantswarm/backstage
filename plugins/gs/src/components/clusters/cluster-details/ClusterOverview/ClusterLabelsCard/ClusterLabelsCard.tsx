import { useMemo, useState } from 'react';
import { InfoCard } from '@backstage/core-components';
import { ClusterLabels } from './ClusterLabels/ClusterLabels';
import { getClusterLabels } from '@giantswarm/backstage-plugin-gs-common';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { getClusterLabelsWithDisplayInfo } from './utils';
import {
  Box,
  FormControlLabel,
  FormGroup,
  Switch,
  Typography,
} from '@material-ui/core';

export function ClusterLabelsCard() {
  const [displayRawLabels, setDisplayRawLabels] = useState(false);

  const { cluster } = useCurrentCluster();
  const labels = getClusterLabels(cluster);
  const visibleLabels = useMemo(() => {
    if (typeof labels === 'undefined') {
      return undefined;
    }

    return getClusterLabelsWithDisplayInfo(labels, !displayRawLabels);
  }, [labels, displayRawLabels]);

  return (
    <InfoCard
      title="Labels"
      action={
        <Box marginTop="6px">
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={displayRawLabels}
                  onChange={() => {
                    setDisplayRawLabels(!displayRawLabels);
                  }}
                />
              }
              label="Display raw labels"
            />
          </FormGroup>
        </Box>
      }
    >
      {visibleLabels ? (
        <ClusterLabels
          labels={visibleLabels}
          displayRawLabels={displayRawLabels}
        />
      ) : (
        <Typography variant="body2">This cluster has no labels.</Typography>
      )}
    </InfoCard>
  );
}
