import { Box } from '@material-ui/core';
import { EmptyState, Progress } from '@backstage/core-components';
import { ContentContainer } from './ContentContainer';
import { OverviewTree } from './OverviewTree';
import { useFluxOverviewData } from '../FluxOverviewDataProvider';
import { SelectedResourceRef } from './useSelectedResource';

export const FluxOverview = ({
  selectedResourceRef,
  onSelectResource,
}: {
  selectedResourceRef: SelectedResourceRef | null;
  onSelectResource: (
    cluster: string,
    kind: string,
    name: string,
    namespace?: string,
  ) => void;
}) => {
  const { tree, isLoading, resourceType } = useFluxOverviewData();

  const compactView = resourceType === 'flux';

  return (
    <Box display="flex" flexDirection="column" height="100%">
      {isLoading ? <Progress /> : null}

      {!isLoading && !tree ? (
        <EmptyState
          missing="info"
          title="No information to display"
          description="Please select a cluster to view Flux resources."
        />
      ) : null}

      {tree ? (
        <ContentContainer
          renderContent={containerHeight => (
            <OverviewTree
              tree={tree}
              compactView={compactView}
              selectedResourceRef={selectedResourceRef}
              height={containerHeight}
              onSelectResource={onSelectResource}
            />
          )}
        />
      ) : null}
    </Box>
  );
};
