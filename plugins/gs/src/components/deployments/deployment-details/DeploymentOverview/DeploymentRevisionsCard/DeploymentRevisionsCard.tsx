import { InfoCard } from '@backstage/core-components';
import { Grid, Typography } from '@material-ui/core';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { formatVersion } from '../../../../utils/helpers';
import {
  AppKind,
  getAppCurrentVersion,
  getAppVersion,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
} from '@giantswarm/backstage-plugin-gs-common';
import { getSourceLocationFromEntity } from '../../../../utils/entity';
import { useCatalogEntityForDeployment } from '../../../../hooks';
import { AboutField } from '@backstage/plugin-catalog';
import { AboutFieldValue, Version } from '../../../../UI';

export function DeploymentRevisionsCard() {
  const { deployment } = useCurrentDeployment();
  const { catalogEntity } = useCatalogEntityForDeployment(deployment);

  const lastAppliedRevision =
    deployment.kind === AppKind
      ? getAppCurrentVersion(deployment)
      : getHelmReleaseLastAppliedRevision(deployment);

  const lastAttemptedRevision =
    deployment.kind === AppKind
      ? getAppVersion(deployment)
      : getHelmReleaseLastAttemptedRevision(deployment);

  const sourceLocation = catalogEntity
    ? getSourceLocationFromEntity(catalogEntity)
    : undefined;

  return (
    <InfoCard title="Revision">
      <Grid container spacing={5}>
        <AboutField label="Last applied" gridSizes={{ xs: 6 }}>
          <AboutFieldValue>
            <Typography variant="inherit">
              <Version
                version={formatVersion(lastAppliedRevision ?? '')}
                sourceLocation={sourceLocation}
                displayWarning={lastAppliedRevision !== lastAttemptedRevision}
              />
            </Typography>
          </AboutFieldValue>
        </AboutField>
        <AboutField label="Last attempted" gridSizes={{ xs: 6 }}>
          <AboutFieldValue>
            <Typography variant="inherit">
              <Version
                version={formatVersion(lastAttemptedRevision ?? '')}
                sourceLocation={sourceLocation}
              />
            </Typography>
          </AboutFieldValue>
        </AboutField>
      </Grid>
    </InfoCard>
  );
}
