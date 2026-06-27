import { Box } from '@material-ui/core';
import {
  MultipleClustersSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMusterData } from '../MusterDataProvider';

/**
 * Selects which muster installations the CRD reads fan out to. Reuses the
 * clusters-page selector mechanism (shared `installations` URL param +
 * localStorage), so the choice is remembered and shared with the rest of the
 * portal.
 *
 * ponytail: lists every reachable installation rather than probing for the
 * muster CRDs first. Installations without muster simply return isolated,
 * suppressed NotFound/incompatibility errors. Narrow to muster-running MCs
 * (config list or CRD presence) if the noise ever matters.
 */
export const InstallationPicker = () => {
  const { setActiveInstallations } = useMusterData();
  const { clusters, isLoading } = useClustersInfo();

  return (
    <Box py={clusters.length > 1 ? 1 : 0}>
      <MultipleClustersSelector
        label="Installations"
        persistToURL
        urlParameterName="installations"
        clusters={clusters}
        disabled={isLoading}
        onActiveClustersChange={setActiveInstallations}
      />
    </Box>
  );
};
