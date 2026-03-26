import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { Grid } from '@backstage/ui';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { formatVersion } from '../../../../utils/helpers';
import { getSourceLocationFromEntity } from '../../../../utils/entity';
import { useCatalogEntityForDeployment } from '../../../../hooks';
import { AboutField, AboutFieldValue, Version } from '../../../../UI';
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
      <Grid.Root columns="2" gap="5">
        <AboutField label="Last applied">
          <AboutFieldValue>
            <Version
              version={formatVersion(lastAppliedRevision ?? '')}
              sourceLocation={sourceLocation}
              displayWarning={lastAppliedRevision !== lastAttemptedRevision}
            />
          </AboutFieldValue>
        </AboutField>
        <AboutField label="Last attempted">
          <AboutFieldValue>
            <Version
              version={formatVersion(lastAttemptedRevision ?? '')}
              sourceLocation={sourceLocation}
            />
          </AboutFieldValue>
        </AboutField>
      </Grid.Root>
    </InfoCard>
  );
}
