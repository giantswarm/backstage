import { Box, Grid, Typography } from '@material-ui/core';
import { CodeBlock, NotAvailable } from '../../../../../UI';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useInstallationsInfo } from '../../../../../hooks';
import { isManagementCluster } from '../../../../utils';

type ClusterAccessProps = {
  cluster: Cluster;
  installationName: string;
};

function getKubectlGsLoginCommand(
  baseDomain: string,
  clusterName: string,
  isMC: boolean,
) {
  const baseCommand = `kubectl gs login api.${baseDomain}`;

  if (isMC) {
    return baseCommand;
  }

  return `${baseCommand} \\\n  --workload-cluster ${clusterName} \\\n  --certificate-group system:masters`;
}

export const ClusterAccessCustomer = ({
  cluster,
  installationName,
}: ClusterAccessProps) => {
  const { installationsInfo } = useInstallationsInfo();
  const baseDomain = installationsInfo.find(
    info => info.name === installationName,
  )?.baseDomain;
  const isMC = isManagementCluster(cluster);

  return (
    <Grid container direction="column">
      <Grid item>
        <Box>
          <Typography variant="body2">
            This command will set up your kubectl context{' '}
            <code>
              {isMC
                ? `gs-${installationName}`
                : `gs-${installationName}-${cluster.getName()}-clientcert`}
            </code>
            :
          </Typography>
          <Box marginTop={1}>
            {baseDomain ? (
              <CodeBlock
                text={getKubectlGsLoginCommand(
                  baseDomain,
                  cluster.getName(),
                  isMC,
                )}
                language="bash"
              />
            ) : (
              <NotAvailable />
            )}
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
};
