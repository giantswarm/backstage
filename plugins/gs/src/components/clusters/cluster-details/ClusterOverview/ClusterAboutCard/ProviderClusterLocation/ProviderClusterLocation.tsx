import { ClusterSwitch } from '../../../ClusterSwitch';
import { AWSClusterLocation } from './AWSClusterLocation';
import { AzureClusterLocation } from './AzureClusterLocation';

export const ProviderClusterLocation = () => {
  return (
    <ClusterSwitch
      renderAWS={infrastructureRef => (
        <AWSClusterLocation infrastructureRef={infrastructureRef} />
      )}
      renderAzure={infrastructureRef => (
        <AzureClusterLocation infrastructureRef={infrastructureRef} />
      )}
      renderVSphere={() => null}
      renderVCD={() => null}
    />
  );
};
