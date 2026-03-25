import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import { Box, Drawer, IconButton, Typography } from '@material-ui/core';
import { useDetailsPane } from '../../hooks';
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

type DetailsPaneRenderProps = {
  kind: string;
  cluster: string;
  clusterName?: string;
  name: string;
  namespace: string;
};

type DetailsPaneProps = {
  paneId: string;
  prefix?: string;
  title?: string | ((props: DetailsPaneRenderProps) => string);
  render: (props: DetailsPaneRenderProps) => React.ReactElement | null;
};

export const DetailsPane = ({
  paneId,
  prefix,
  title,
  render,
}: DetailsPaneProps) => {
  const classes = useDrawerStyles();

  const { isOpen, getParams, close } = useDetailsPane(paneId, { prefix });
  const { cluster, clusterName, kind, namespace, name } = getParams();

  if (!cluster || !kind || !namespace || !name) {
    return null;
  }

  const handleClose = () => {
    close();
  };

  const renderProps: DetailsPaneRenderProps = {
    kind,
    cluster,
    clusterName: clusterName ?? undefined,
    name,
    namespace,
  };

  const resolvedTitle =
    typeof title === 'function' ? title(renderProps) : title;

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
      <DrawerContent title={resolvedTitle} onClose={handleClose}>
        {render(renderProps)}
      </DrawerContent>
    </Drawer>
  );
};
