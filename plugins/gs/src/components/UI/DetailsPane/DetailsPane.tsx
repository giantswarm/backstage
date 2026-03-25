import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import { Box, Drawer, IconButton, Typography } from '@material-ui/core';
import { useDetailsPane } from '../../hooks';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import CloseIcon from '@material-ui/icons/Close';

const useDrawerStyles = makeStyles((theme: Theme) =>
  createStyles({
    paper: {
      backgroundColor: theme.palette.background.default,
    },
  }),
);

const useDrawerContentStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
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
    closeButton: {
      position: 'absolute',
      top: theme.spacing(1),
      right: theme.spacing(1),
    },
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
  title,
  children,
  onClose,
}: {
  title?: string;
  children?: React.ReactNode;
  onClose: () => void;
}) => {
  const classes = useDrawerContentStyles();

  return (
    <Box className={classes.root}>
      <IconButton
        className={classes.closeButton}
        title="Close the drawer"
        aria-label="Close the drawer"
        onClick={onClose}
      >
        <CloseIcon />
      </IconButton>
      {title && (
        <div className={classes.header}>
          <Typography className={classes.title}>{title}</Typography>
        </div>
      )}

      <div>{children}</div>
    </Box>
  );
};

type DetailsPaneProps = {
  paneId: string;
  title?: string;
  render: (props: {
    kind: string;
    installationName: string;
    name: string;
    namespace: string;
    clusterName?: string;
  }) => React.ReactElement | null;
};

export const DetailsPane = ({ paneId, title, render }: DetailsPaneProps) => {
  const classes = useDrawerStyles();

  const { isOpen, getParams, close } = useDetailsPane(paneId);
  const { installationName, kind, namespace, name, clusterName } = getParams();

  if (!installationName || !kind || !namespace || !name) {
    return null;
  }

  const handleClose = () => {
    close();
  };

  return (
    <Drawer
      classes={{
        paper: classes.paper,
      }}
      anchor="right"
      open={isOpen}
      onClose={handleClose}
      variant="persistent"
    >
      <DrawerContent title={title ?? name} onClose={handleClose}>
        <ErrorsProvider>
          {render({
            kind,
            installationName,
            name,
            namespace,
            clusterName: clusterName ?? undefined,
          })}
        </ErrorsProvider>
      </DrawerContent>
    </Drawer>
  );
};
