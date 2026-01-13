import { useMemo } from 'react';
import { Box, Drawer, IconButton, makeStyles } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import {
  HelmRelease,
  GitRepository,
  HelmRepository,
  OCIRepository,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { Details } from '../Details';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';

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

export const SelectedResourceDrawer = ({
  selectedResourceRef,
  kustomizations,
  helmReleases,
  gitRepositories,
  ociRepositories,
  helmRepositories,
  treeBuilder,
  isLoadingResources,
  onClose,
}: {
  selectedResourceRef: {
    cluster: string;
    kind: string;
    name: string;
    namespace?: string;
  };
  kustomizations: Kustomization[];
  helmReleases: HelmRelease[];
  gitRepositories: GitRepository[];
  ociRepositories: OCIRepository[];
  helmRepositories: HelmRepository[];
  treeBuilder?: KustomizationTreeBuilder;
  isLoadingResources: boolean;
  onClose: () => void;
}) => {
  const classes = useStyles();

  const selectedResource = useMemo(() => {
    if (!selectedResourceRef) {
      return undefined;
    }
    if (selectedResourceRef.kind === Kustomization.kind.toLowerCase()) {
      return kustomizations.find(
        k =>
          k.getNamespace() === selectedResourceRef.namespace &&
          k.getName() === selectedResourceRef.name,
      );
    }

    if (selectedResourceRef.kind === HelmRelease.kind.toLowerCase()) {
      return helmReleases.find(
        h =>
          h.getNamespace() === selectedResourceRef.namespace &&
          h.getName() === selectedResourceRef.name,
      );
    }

    if (selectedResourceRef.kind === GitRepository.kind.toLowerCase()) {
      return gitRepositories.find(
        r =>
          r.getNamespace() === selectedResourceRef.namespace &&
          r.getName() === selectedResourceRef.name,
      );
    }

    if (selectedResourceRef.kind === OCIRepository.kind.toLowerCase()) {
      return ociRepositories.find(
        r =>
          r.getNamespace() === selectedResourceRef.namespace &&
          r.getName() === selectedResourceRef.name,
      );
    }

    if (selectedResourceRef.kind === HelmRepository.kind.toLowerCase()) {
      return helmRepositories.find(
        r =>
          r.getNamespace() === selectedResourceRef.namespace &&
          r.getName() === selectedResourceRef.name,
      );
    }

    return undefined;
  }, [
    selectedResourceRef,
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
  ]);

  // const prevActiveCluster = useRef(activeCluster);
  // useEffect(() => {
  //   if (activeCluster !== prevActiveCluster.current) {
  //     if (selectedResourceRef) {
  //       clearSelectedResource();
  //     }
  //     prevActiveCluster.current = activeCluster;
  //   }
  // }, [activeCluster, clearSelectedResource, selectedResourceRef]);

  return (
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
          onClick={onClose}
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
            isLoadingResources={isLoadingResources}
          />
        ) : null}
      </Box>
    </Drawer>
  );
};
