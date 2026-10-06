import { ReactNode, useEffect } from 'react';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import { Drawer } from '@material-ui/core';
import { ButtonIcon, Text } from '@backstage/ui';
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
      // Clear of the close button in the corner.
      paddingRight: theme.spacing(5),
    },
  }),
);

const DrawerContent = ({
  title,
  children,
  onClose,
}: {
  title?: ReactNode;
  children?: React.ReactNode;
  onClose: () => void;
}) => {
  const classes = useDrawerContentStyles();

  return (
    <div className={classes.root}>
      <ButtonIcon
        className={classes.closeButton}
        aria-label="Close the drawer"
        icon={<CloseIcon />}
        variant="tertiary"
        onPress={onClose}
      />
      {title && (
        <div className={classes.header}>
          <Text as="h2" variant="title-small" weight="bold">
            {title}
          </Text>
        </div>
      )}

      <div>{children}</div>
    </div>
  );
};

type DetailsDrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
};

/**
 * The right-anchored details drawer `DetailsPane` renders, for any content:
 * a pane whose open state lives elsewhere (a page's own query parameter).
 * Escape closes it, unless an overlay inside it (a menu, a dialog) handled
 * the key first.
 */
export const DetailsDrawer = ({
  open,
  onClose,
  title,
  children,
}: DetailsDrawerProps) => {
  const classes = useDrawerStyles();

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <Drawer
      classes={{
        paper: classes.paper,
      }}
      anchor="right"
      open={open}
      onClose={onClose}
      variant="persistent"
    >
      <DrawerContent title={title} onClose={onClose}>
        {children}
      </DrawerContent>
    </Drawer>
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
    <DetailsDrawer open={isOpen} onClose={handleClose} title={resolvedTitle}>
      {render(renderProps)}
    </DetailsDrawer>
  );
};
