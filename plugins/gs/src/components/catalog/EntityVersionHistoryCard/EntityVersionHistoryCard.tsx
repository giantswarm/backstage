import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { Typography } from '@material-ui/core';
import { QueryClientProvider } from '../../QueryClientProvider';
import { getOciRepositoryFromEntity } from '../../utils/entity';
import { OciTagsListCard } from '../OciTagsListCard';

const VersionHistoryCardContent = () => {
  const { entity } = useEntity();
  const ociRepository = getOciRepositoryFromEntity(entity);

  if (!ociRepository) {
    return (
      <InfoCard title="Version History">
        <Typography variant="inherit" color="textSecondary">
          No <code>giantswarm.io/oci-repository</code> annotation set on this
          entity.
        </Typography>
      </InfoCard>
    );
  }

  return <OciTagsListCard ociRepository={ociRepository} />;
};

export const EntityVersionHistoryCard = () => {
  return (
    <QueryClientProvider>
      <VersionHistoryCardContent />
    </QueryClientProvider>
  );
};
