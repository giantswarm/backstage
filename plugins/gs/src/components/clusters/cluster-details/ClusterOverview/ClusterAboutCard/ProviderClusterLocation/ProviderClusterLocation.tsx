import { ClusterSwitch } from '../../../ClusterSwitch';
import { AWSClusterLocation } from './AWSClusterLocation';
import { AzureClusterLocation } from './AzureClusterLocation';
import { AzureASOManagedClusterLocation } from './AzureASOManagedClusterLocation';

export const ProviderClusterLocation = () => {
  return (
    <ClusterSwitch
      renderAWS={infrastructureRef => (
        <AWSClusterLocation infrastructureRef={infrastructureRef} />
      )}
      renderAzure={infrastructureRef => (
        <AzureClusterLocation infrastructureRef={infrastructureRef} />
      )}
      renderAzureManaged={infrastructureRef => (
        <AzureASOManagedClusterLocation infrastructureRef={infrastructureRef} />
      )}
      renderVSphere={() => null}
      renderVCD={() => null}
    />
  );
};
