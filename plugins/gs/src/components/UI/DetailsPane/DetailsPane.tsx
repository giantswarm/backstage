import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import { Drawer, IconButton, Typography } from '@material-ui/core';
import Close from '@material-ui/icons/Close';
import { useDetailsPane } from '../../hooks';
import { ErrorsProvider } from '../../Errors';

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
  title,
  children,
  onClose,
}: {
  title: string;
  children?: React.ReactNode;
  onClose: () => void;
}) => {
  const classes = useDrawerContentStyles();

  return (
    <>
      <div className={classes.header}>
        <Typography className={classes.title}>{title}</Typography>
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

type DetailsPaneProps = {
  paneId: string;
  title?: string;
  render: (props: {
    kind: string;
    installationName: string;
    name: string;
    namespace: string;
  }) => React.ReactElement | null;
};

export const DetailsPane = ({ paneId, title, render }: DetailsPaneProps) => {
  const classes = useDrawerStyles();

  const { isOpen, getParams, close } = useDetailsPane(paneId);
  const { installationName, kind, namespace, name } = getParams();

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
    >
      <DrawerContent title={title ?? name} onClose={handleClose}>
        <ErrorsProvider>
          {render({ kind, installationName, name, namespace })}
        </ErrorsProvider>
      </DrawerContent>
    </Drawer>
  );
};
