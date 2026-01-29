import { ClusterSwitch } from '../../../ClusterSwitch';
import { AWSClusterLocation } from './AWSClusterLocation';
import { AzureClusterLocation } from './AzureClusterLocation';

export const ProviderClusterLocation = () => {
  return (
    <ClusterSwitch
      renderAWS={() => <AWSClusterLocation />}
      renderAzure={() => <AzureClusterLocation />}
      renderVSphere={() => null}
      renderVCD={() => null}
    />
  );
};
