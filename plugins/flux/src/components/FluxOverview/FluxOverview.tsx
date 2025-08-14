import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Drawer, IconButton, makeStyles } from '@material-ui/core';
import { KustomizationTreeBuilder } from './utils/KustomizationTreeBuilder';
import { useCallback, useMemo, useState } from 'react';
import { Menu } from './Menu';
import { useSelectedResource } from './useSelectedResource';
import { Details } from './Details';
import { useFluxResources } from './useFluxResources';
import { EmptyState, Progress } from '@backstage/core-components';
import CloseIcon from '@material-ui/icons/Close';
import { ContentContainer } from './ContentContainer';
import { OverviewTree } from './OverviewTree';

const useStyles = makeStyles(theme => ({
  drawerPaper: {
    backgroundColor: theme.palette.type === 'light' ? '#eee' : '#3a3a3a',
  },
  drawerContent: {
    padding: theme.spacing(3, 3, 6, 3),
    position: 'relative',
    width: '95vw',

    [theme.breakpoints.up('md')]: {
      width: '60vw',
    },

    [theme.breakpoints.up('lg')]: {
      width: '45vw',
    },
  },
  drawerCloseButton: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
  },
}));

export const FluxOverview = () => {
  const classes = useStyles();
  const [compactView, setCompactView] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  const {
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
  } = useFluxResources(selectedCluster);

  const { selectedResourceRef, clearSelectedResource } = useSelectedResource();
  const selectedResource = useMemo(() => {
    if (!selectedResourceRef) {
      return undefined;
    }

    if (selectedResourceRef.kind === Kustomization.kind.toLowerCase()) {
      return kustomizations.find(
        k =>
          k.cluster === selectedResourceRef.cluster &&
          k.getNamespace() === selectedResourceRef.namespace &&
          k.getName() === selectedResourceRef.name,
      );
    }

    return helmReleases.find(
      h =>
        h.cluster === selectedResourceRef.cluster &&
        h.getNamespace() === selectedResourceRef.namespace &&
        h.getName() === selectedResourceRef.name,
    );
  }, [selectedResourceRef, kustomizations, helmReleases]);

  const handleSelectedClusterChange = useCallback(
    (selectedItem: string | null) => {
      setSelectedCluster(selectedItem);
    },
    [setSelectedCluster],
  );

  const { treeBuilder, tree } = useMemo(() => {
    if (isLoading || kustomizations.length === 0) {
      return { treeBuilder: undefined, tree: undefined };
    }

    const builder = new KustomizationTreeBuilder(
      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
    );

    return { treeBuilder: builder, tree: builder.buildTree() };
  }, [
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
  ]);

  return (
    <Box display="flex" flexDirection="column" height="100%">
      <Menu
        onSelectedClusterChange={handleSelectedClusterChange}
        compactView={compactView}
        onCompactViewChange={() => setCompactView(!compactView)}
      />

      {!Boolean(selectedCluster) ? (
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
            />
          )}
        />
      ) : null}

      {isLoading ? <Progress /> : null}

      <Drawer
        open={Boolean(selectedResourceRef)}
        anchor="right"
        variant="persistent"
        PaperProps={{
          className: classes.drawerPaper,
        }}
      >
        <Box className={classes.drawerContent}>
          <IconButton
            className={classes.drawerCloseButton}
            aria-label="Close resource details"
            onClick={() => {
              clearSelectedResource();
            }}
          >
            <CloseIcon />
          </IconButton>

          {selectedResourceRef ? (
            <Details
              resourceRef={selectedResourceRef}
              resource={selectedResource}
              treeBuilder={treeBuilder}
              allKustomizations={kustomizations}
              allHelmReleases={helmReleases}
              allGitRepositories={gitRepositories}
              allOCIRepositories={ociRepositories}
              allHelmRepositories={helmRepositories}
              isLoadingResources={isLoading}
            />
          ) : null}
        </Box>
      </Drawer>
    </Box>
  );
};
