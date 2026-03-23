import { ClusterSwitch } from '../ClusterSwitch';
import { AWSNodePools } from './AWSNodePools';
import { AzureNodePools } from './AzureNodePools';

export const ClusterNodePools = () => {
  return (
    <ClusterSwitch
      renderAWS={() => <AWSNodePools />}
      renderAzure={() => <AzureNodePools />}
      renderVSphere={() => null}
      renderVCD={() => null}
    />
  );
};
