import { Box } from '@material-ui/core';
import {
  MultipleClustersSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useDisabledInstallations } from '../../../hooks';

type InstallationPickerProps = {
  onActiveInstallationsChange: (installations: string[]) => void;
  persistToURL?: boolean;
};

export const InstallationPicker = ({
  onActiveInstallationsChange,
  persistToURL,
}: InstallationPickerProps) => {
  const { clusters, isLoadingClusters } = useClustersInfo();
  const { disabledInstallations, isLoading: isLoadingDisabledInstallations } =
    useDisabledInstallations();

  return (
    <Box py={clusters.length > 1 ? 1 : undefined}>
      <MultipleClustersSelector
        label="Installations"
        persistToURL={persistToURL}
        urlParameterName="installations"
        clusters={clusters}
        disabledClusters={disabledInstallations}
        isLoadingDisabledClusters={isLoadingDisabledInstallations}
        disabled={isLoadingClusters}
        onActiveClustersChange={onActiveInstallationsChange}
      />
    </Box>
  );
};
