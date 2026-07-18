import { useEffect, useMemo, useState } from 'react';
import { Box } from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import {
  MultipleClustersSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useDisabledInstallations } from '../../../hooks';
import { mutedInstallationsApiRef } from '../../../../apis/mutedInstallations';

type InstallationPickerProps = {
  onActiveInstallationsChange: (installations: string[]) => void;
  persistToURL?: boolean;
};

export const InstallationPicker = ({
  onActiveInstallationsChange,
  persistToURL,
}: InstallationPickerProps) => {
  const { clusters, isLoading } = useClustersInfo();
  const { disabledInstallations, isLoading: isLoadingDisabledInstallations } =
    useDisabledInstallations();

  // Installations the user has muted app-wide are excluded from fleet fetches
  // exactly like health-disabled ones: fold them into disabledClusters, which
  // MultipleClustersSelector both greys out and drops from the active set.
  const mutedApi = useApi(mutedInstallationsApiRef);
  const [muted, setMuted] = useState<string[]>(() => mutedApi.getSnapshot());
  useEffect(() => {
    const subscription = mutedApi.muted$().subscribe(setMuted);
    return () => subscription.unsubscribe();
  }, [mutedApi]);

  const disabledClusters = useMemo(
    () => Array.from(new Set([...disabledInstallations, ...muted])),
    [disabledInstallations, muted],
  );

  return (
    <Box py={clusters.length > 1 ? 1 : 0}>
      <MultipleClustersSelector
        label="Installations"
        persistToURL={persistToURL}
        urlParameterName="installations"
        clusters={clusters}
        disabledClusters={disabledClusters}
        isLoadingDisabledClusters={isLoadingDisabledInstallations}
        disabled={isLoading}
        onActiveClustersChange={onActiveInstallationsChange}
      />
    </Box>
  );
};
