import React from 'react';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import { Drawer, IconButton, Typography } from '@material-ui/core';
import Close from '@material-ui/icons/Close';
import { useSearchParams } from 'react-router-dom';
import { AppDetails } from '../AppDetails';
import { HelmReleaseDetails } from '../HelmReleaseDetails';

const useDrawerStyles = makeStyles((theme: Theme) =>
  createStyles({
    paper: {
      minWidth: '450px',
      maxWidth: '650px',
      width: '30%',
      padding: theme.spacing(2.5),
      backgroundColor: theme.palette.background.default,
    },
  }),
);

const useDrawerContentStyles = makeStyles((theme: Theme) =>
  createStyles({
    header: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing(2),
    },
    title: {
      ...theme.typography.h5,
      marginBottom: 0,
    },
    icon: {
      fontSize: 20,
    },
  }),
);

const DrawerContent = ({
  children,
  onClose,
}: {
  children?: React.ReactNode;
  onClose: () => void;
}) => {
  const classes = useDrawerContentStyles();

  return (
    <>
      <div className={classes.header}>
        <Typography className={classes.title}>Deployment details</Typography>
        <IconButton
          key="dismiss"
          title="Close the drawer"
          onClick={onClose}
          color="inherit"
        >
          <Close className={classes.icon} />
        </IconButton>
      </div>
      <div>{children}</div>
    </>
  );
};

type DeploymentDetailsProps = {
  sourceLocation?: string;
  isOpen?: boolean;
  onClose?: () => void;
};

export const DeploymentDetails = ({
  sourceLocation,
  isOpen,
  onClose,
}: DeploymentDetailsProps) => {
  const classes = useDrawerStyles();

  const [searchParams] = useSearchParams();

  const installationName = searchParams.get('installation');
  const kind = searchParams.get('kind');
  const namespace = searchParams.get('namespace');
  const name = searchParams.get('name');

  if (!installationName || !kind || !namespace || !name) {
    return null;
  }

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <Drawer
      classes={{
        paper: classes.paper,
      }}
      anchor="right"
      open={isOpen}
      onClose={handleClose}
    >
      <DrawerContent onClose={handleClose}>
        {kind === 'app' && (
          <AppDetails
            installationName={installationName}
            name={name}
            namespace={namespace}
            sourceLocation={sourceLocation}
          />
        )}
        {kind === 'helmrelease' && (
          <HelmReleaseDetails
            installationName={installationName}
            name={name}
            namespace={namespace}
            sourceLocation={sourceLocation}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
};
