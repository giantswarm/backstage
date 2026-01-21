import { useEffect, useMemo, useRef } from 'react';
import { Box } from '@material-ui/core';
import { EmptyState, Progress } from '@backstage/core-components';
import { ContentContainer } from './ContentContainer';
import { OverviewTree, OverviewTreeRef } from './OverviewTree';
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
  const {
    tree,
    isLoading,
    resourceType,
    searchMatches,
    currentMatchId,
    pathsToExpand,
  } = useFluxOverviewData();

  const treeRef = useRef<OverviewTreeRef>(null);
  const compactView = resourceType === 'flux';

  const searchMatchIds = useMemo(() => new Set(searchMatches), [searchMatches]);

  // Scroll to the current match when it changes
  useEffect(() => {
    if (currentMatchId && treeRef.current) {
      // Small delay to allow auto-expand to complete first
      const timeoutId = setTimeout(() => {
        treeRef.current?.scrollToItem(currentMatchId, 'center');
      }, 100);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [currentMatchId]);

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
              ref={treeRef}
              tree={tree}
              compactView={compactView}
              selectedResourceRef={selectedResourceRef}
              height={containerHeight}
              onSelectResource={onSelectResource}
              searchMatchIds={searchMatchIds}
              currentMatchId={currentMatchId}
              pathsToExpand={pathsToExpand}
            />
          )}
        />
      ) : null}
    </Box>
  );
};
