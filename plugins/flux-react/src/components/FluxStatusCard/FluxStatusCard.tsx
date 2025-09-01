import { Link as RouterLink } from 'react-router-dom';
import { InfoCard, Link } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import { ResourceStatus } from './ResourceStatus';
import { KubernetesQueryClientProvider } from '@giantswarm/backstage-plugin-kubernetes-react';

type FluxStatusCardProps = {
  cluster: string;
};

export const FluxStatusCard = ({ cluster }: FluxStatusCardProps) => {
  return (
    <KubernetesQueryClientProvider>
      <InfoCard
        title="Flux status"
        action={
          <Box mt={1} mr={1} pt={1}>
            <Link component={RouterLink} to={`/flux?cluster=${cluster}`}>
              <Typography variant="body1">Flux overview</Typography>
            </Link>
          </Box>
        }
      >
        <ResourceStatus cluster={cluster} />
      </InfoCard>
    </KubernetesQueryClientProvider>
  );
};
