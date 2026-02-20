import { ClusterSwitch } from '../ClusterSwitch';
import { AWSNodePoolsTable } from './AWSNodePoolsTable';
import { AzureNodePoolsTable } from './AzureNodePoolsTable';

export const ClusterNodePools = () => {
  return (
    <ClusterSwitch
      renderAWS={() => <AWSNodePoolsTable />}
      renderAzure={() => <AzureNodePoolsTable />}
      renderVSphere={() => null}
      renderVCD={() => null}
    />
  );
};
