import { ReactNode } from 'react';
import { Box, Drawer, Grid, IconButton, makeStyles } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';

const useStyles = makeStyles(theme => ({
  details: {
    height: '100vh',
    position: 'sticky',
    top: 0,
  },
  drawerContent: {
    padding: theme.spacing(3, 3, 6, 3),
    position: 'relative',
    backgroundColor: theme.palette.grey[200],
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

type LayoutProps = {
  content: ReactNode;
  details?: ReactNode;
  onDetailsClose?: () => void;
};

export const Layout = ({ content, details, onDetailsClose }: LayoutProps) => {
  const classes = useStyles();

  return (
    <>
      <Grid container spacing={3} alignItems="flex-start">
        <Grid item xs={12} lg={6}>
          {content}
        </Grid>
      </Grid>
      <Drawer
        open={Boolean(details)}
        anchor="right"
        disableAutoFocus
        keepMounted
        variant="persistent"
      >
        <Box className={classes.drawerContent}>
          <IconButton
            className={classes.drawerCloseButton}
            aria-label="Close resource details"
            onClick={() => {
              if (onDetailsClose) {
                onDetailsClose();
              }
            }}
          >
            <CloseIcon />
          </IconButton>
          {details}
        </Box>
      </Drawer>
    </>
  );
};
