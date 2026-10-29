import {
  AWSCluster,
  AzureASOManagedCluster,
  AzureCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ClusterSwitch } from '../../../ClusterSwitch';
import { ProviderClusterLocationValue } from './ProviderClusterLocationValue';

export const ProviderClusterLocation = () => {
  return (
    <ClusterSwitch
      renderAWS={infrastructureRef => (
        <ProviderClusterLocationValue
          model={AWSCluster}
          infrastructureRef={infrastructureRef}
        />
      )}
      renderAzure={infrastructureRef => (
        <ProviderClusterLocationValue
          model={AzureCluster}
          infrastructureRef={infrastructureRef}
        />
      )}
      renderAzureManaged={infrastructureRef => (
        <ProviderClusterLocationValue
          model={AzureASOManagedCluster}
          infrastructureRef={infrastructureRef}
        />
      )}
      renderVSphere={() => null}
      renderVCD={() => null}
    />
  );
};
