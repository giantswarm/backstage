import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, makeStyles, Paper, PaperProps } from '@material-ui/core';
import { ResourceInfo } from './ResourceInfo';
import { ResourceStatus } from './ResourceStatus';
import classNames from 'classnames';
import { ResourceMetadata } from './ResourceMetadata';
import { colord } from 'colord';

const useStyles = makeStyles(theme => ({
  root: {
    position: 'relative',
    border: '1px solid transparent',

    'a:hover > &': {
      backgroundColor: theme.palette.grey[50],
    },
  },
  rootError: {
    backgroundColor: theme.palette.errorBackground,

    'a:hover > &': {
      backgroundColor: colord(theme.palette.errorBackground)
        .darken(0.01)
        .toHex(),
    },
  },
  rootHighlighted: {
    borderColor: theme.palette.grey[500],

    '&$rootError': {
      borderColor: theme.palette.error.light,
    },
  },
}));

type ResourceWrapperProps = PaperProps & {
  highlighted?: boolean;
  error?: boolean;
};

export const ResourceWrapper = ({
  highlighted,
  error,
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
  resource?: Kustomization | HelmRelease;
  highlighted?: boolean;
  error?: boolean;
};

export const ResourceCard = ({
  name,
  namespace,
  kind,
  cluster,
  targetCluster,
  resource,
  highlighted,
  error,
}: ResourceCardProps) => {
  return (
    <ResourceWrapper highlighted={highlighted} error={error}>
      <Box
        display="flex"
        flexDirection="column"
        position="relative"
        flexGrow={1}
        p={2}
      >
        <ResourceInfo
          kind={kind}
          name={name}
          namespace={namespace}
          cluster={cluster}
          targetCluster={targetCluster}
        />

        {resource && <ResourceMetadata resource={resource} />}

        {resource && <ResourceStatus resource={resource} />}
      </Box>
    </ResourceWrapper>
  );
};
