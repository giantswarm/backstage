# AWS instance types and Azure VM sizes

We maintain two JSON data files for cloud provider VM/machine/instance type capabilities:

- `plugins/gs/src/components/clusters/cluster-details/ClusterNodePools/NodePoolNodes/awsInstanceTypes.json`
- `plugins/gs/src/components/clusters/cluster-details/ClusterNodePools/NodePoolNodes/azureVmTypes.json`

Please do not edit these files manually!

These files are created using the scripts in https://github.com/giantswarm/machine-types-util
