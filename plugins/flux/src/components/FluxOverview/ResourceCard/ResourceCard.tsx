import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, makeStyles, Paper, PaperProps } from '@material-ui/core';
import classNames from 'classnames';
import { ResourceMetadata } from './ResourceMetadata';
import { useResourceStatus } from './ResourceStatus/useResourceStatus';
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
      borderColor: colors.default.borderColor,

      '&$rootError': {
        borderColor: colors.error.borderColor,
      },

      '&$rootInactive': {
        borderColor: colors.inactive.borderColor,
      },
    },
  };
});

type ResourceWrapperProps = PaperProps & {
  highlighted?: boolean;
  error?: boolean;
  inactive?: boolean;
};

export const ResourceWrapper = ({
  highlighted,
  error,
  inactive,
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
    | HelmRepository;
  highlighted?: boolean;
  error?: boolean;
};

export const ResourceCard = ({
  name,
  namespace,
  kind,
  targetCluster,
  resource,
  highlighted,
  error,
}: ResourceCardProps) => {
  const { readyStatus, isReconciling, isSuspended } =
    useResourceStatus(resource);

  return (
    <ResourceWrapper
      highlighted={highlighted}
      error={readyStatus === 'False' || error}
      inactive={isSuspended}
    >
      <Box display="flex" flexDirection="column" flexGrow={1} p={2} pt={1}>
        <ResourceInfo
          name={name}
          kind={kind}
          namespace={namespace}
          targetCluster={targetCluster}
          readyStatus={readyStatus}
          isReconciling={isReconciling}
          isSuspended={isSuspended}
          resource={resource}
        />
        {resource && <ResourceMetadata resource={resource} />}
      </Box>
    </ResourceWrapper>
  );
};
