import { useMemo } from 'react';
import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, makeStyles, Paper, PaperProps } from '@material-ui/core';
import classNames from 'classnames';
import { ResourceMetadata } from './ResourceMetadata';
import { makeResourceCardColorVariants } from './utils/makeResourceCardColorVariants';
import { ResourceInfo } from './ResourceInfo';

const palette = makeResourceCardColorVariants();

const useStyles = makeStyles(theme => {
  const colors = palette[theme.palette.type];

  return {
    root: {
      position: 'relative',
      border: '1px solid transparent',
      backgroundColor: colors.default.backgroundColor,

      'a:hover > &': {
        backgroundColor: colors.default.backgroundColorHover,
      },
    },
    rootError: {
      backgroundColor: colors.error.backgroundColor,

      'a:hover > &': {
        backgroundColor: colors.error.backgroundColorHover,
      },
    },
    rootInactive: {
      backgroundColor: colors.inactive.backgroundColor,

      'a:hover > &': {
        backgroundColor: colors.inactive.backgroundColorHover,
      },
    },
    rootHighlighted: {
      borderColor: theme.palette.type === 'light' ? '#000' : '#fff',
    },
    rootSearchMatch: {
      outline: `1px solid ${theme.palette.warning.light}`,
      outlineOffset: 1,
    },
    rootCurrentSearchMatch: {
      outline: '3px solid #e91e63',
      outlineOffset: 1,
    },
  };
});

type ResourceWrapperProps = PaperProps & {
  highlighted?: boolean;
  error?: boolean;
  inactive?: boolean;
  searchMatch?: boolean;
  currentSearchMatch?: boolean;
};

export const ResourceWrapper = ({
  highlighted,
  error,
  inactive,
  searchMatch,
  currentSearchMatch,
  className,
  children,
  ...props
}: ResourceWrapperProps) => {
  const classes = useStyles();

  return (
    <Paper
      {...props}
      className={classNames(
        classes.root,
        {
          [classes.rootHighlighted]: highlighted,
          [classes.rootError]: error,
          [classes.rootInactive]: inactive,
          [classes.rootSearchMatch]: searchMatch && !currentSearchMatch,
          [classes.rootCurrentSearchMatch]: currentSearchMatch,
        },
        className,
      )}
    >
      {children}
    </Paper>
  );
};

type ResourceCardProps = {
  name: string;
  namespace?: string;
  kind: string;
  cluster: string;
  targetCluster?: string;
  resource?:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository
    | ImagePolicy
    | ImageRepository
    | ImageUpdateAutomation;
  source?: GitRepository | OCIRepository | HelmRepository;
  highlighted?: boolean;
  error?: boolean;
};

export const ResourceCard = ({
  cluster,
  name,
  namespace,
  kind,
  targetCluster,
  resource,
  source,
  highlighted,
  error,
}: ResourceCardProps) => {
  const { readyStatus, isDependencyNotReady, isReconciling, isSuspended } =
    useMemo(() => {
      if (!resource) {
        return {
          readyStatus: 'Unknown' as const,
          isDependencyNotReady: false,
          isReconciling: false,
          isSuspended: false,
        };
      }

      return resource.getOrCalculateFluxStatus();
    }, [resource]);

  const inactive = isSuspended || isDependencyNotReady;

  return (
    <ResourceWrapper
      highlighted={highlighted}
      error={readyStatus === 'False' || error}
      inactive={inactive}
    >
      <Box display="flex" flexDirection="column" flexGrow={1} p={2} pt={1}>
        <ResourceInfo
          cluster={cluster}
          name={name}
          kind={kind}
          namespace={namespace}
          targetCluster={targetCluster}
          readyStatus={readyStatus}
          isDependencyNotReady={isDependencyNotReady}
          isReconciling={isReconciling}
          isSuspended={isSuspended}
          resource={resource}
        />
        {resource && <ResourceMetadata resource={resource} source={source} />}
      </Box>
    </ResourceWrapper>
  );
};
