import {
  useEntity,
  useEntityPresentation,
} from '@backstage/plugin-catalog-react';
import { Box, Typography } from '@material-ui/core';
import { QueryClientProvider } from '../../QueryClientProvider';
import { getOciRepositoryFromEntity } from '../../utils/entity';
import { OciTagsTable } from '../OciTagsTable';

const VersionHistoryContent = () => {
  const { entity } = useEntity();
  const { primaryTitle } = useEntityPresentation(entity);
  const ociRepository = getOciRepositoryFromEntity(entity);

  if (!ociRepository) {
    return (
      <Box px={2} py={8}>
        <Typography variant="inherit" color="textSecondary">
          No <code>giantswarm.io/oci-repository</code> annotation set on this
          entity.
        </Typography>
      </Box>
    );
  }

  return <OciTagsTable ociRepository={ociRepository} name={primaryTitle} />;
};

export const EntityVersionHistoryContent = () => {
  return (
    <QueryClientProvider>
      <VersionHistoryContent />
    </QueryClientProvider>
  );
};
