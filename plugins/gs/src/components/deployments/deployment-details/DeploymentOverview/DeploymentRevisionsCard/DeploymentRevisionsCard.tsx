import { InfoCard } from '@backstage/core-components';
import { Grid } from '@material-ui/core';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { formatVersion } from '../../../../utils/helpers';
import { getSourceLocationFromEntity } from '../../../../utils/entity';
import { useCatalogEntityForDeployment } from '../../../../hooks';
import { AboutField } from '@backstage/plugin-catalog';
import { AboutFieldValue, Version } from '../../../../UI';
import { getAttemptedVersion, getVersion } from '../../../utils/getVersion';

export function DeploymentRevisionsCard() {
  const { deployment } = useCurrentDeployment();
  const { catalogEntity } = useCatalogEntityForDeployment(deployment);

  const lastAppliedRevision = getVersion(deployment);
  const lastAttemptedRevision = getAttemptedVersion(deployment);

  const sourceLocation = catalogEntity
    ? getSourceLocationFromEntity(catalogEntity)
    : undefined;

  return (
    <InfoCard title="Revision">
      <Grid container spacing={5}>
        <AboutField label="Last applied" gridSizes={{ xs: 6 }}>
          <AboutFieldValue>
            <Version
              version={formatVersion(lastAppliedRevision ?? '')}
              sourceLocation={sourceLocation}
              displayWarning={lastAppliedRevision !== lastAttemptedRevision}
            />
          </AboutFieldValue>
        </AboutField>
        <AboutField label="Last attempted" gridSizes={{ xs: 6 }}>
          <AboutFieldValue>
            <Version
              version={formatVersion(lastAttemptedRevision ?? '')}
              sourceLocation={sourceLocation}
            />
          </AboutFieldValue>
        </AboutField>
      </Grid>
    </InfoCard>
  );
}
