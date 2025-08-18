import { useState } from 'react';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Drawer from '@material-ui/core/Drawer';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import useMediaQuery from '@material-ui/core/useMediaQuery';
import { Theme, useTheme } from '@material-ui/core/styles';
import FilterListIcon from '@material-ui/icons/FilterList';

export const Filters = (props: {
  children: React.ReactNode;
  options?: {
    drawerBreakpoint?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
    drawerAnchor?: 'left' | 'right' | 'top' | 'bottom';
  };
}) => {
  const isScreenSmallerThanBreakpoint = useMediaQuery(
    (theme: Theme) =>
      theme.breakpoints.down(props.options?.drawerBreakpoint ?? 'md'),
    { noSsr: true },
  );
  const theme = useTheme();
  const [filterDrawerOpen, setFilterDrawerOpen] = useState<boolean>(false);

  return isScreenSmallerThanBreakpoint ? (
    <>
      <Button
        style={{ marginTop: theme.spacing(1), marginLeft: theme.spacing(1) }}
        onClick={() => setFilterDrawerOpen(true)}
        startIcon={<FilterListIcon />}
      >
        Button Title
      </Button>
      <Drawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        anchor={props.options?.drawerAnchor ?? 'left'}
        disableAutoFocus
        keepMounted
        variant="temporary"
      >
        <Box m={2}>
          <Typography
            variant="h6"
            component="h2"
            style={{ marginBottom: theme.spacing(1) }}
          >
            Title
          </Typography>
          {props.children}
        </Box>
      </Drawer>
    </>
  ) : (
    <Grid item lg={2}>
      {props.children}
    </Grid>
  );
};

export const Content = (props: { children: React.ReactNode }) => {
  return (
    <Grid item xs={12} lg={10}>
      {props.children}
    </Grid>
  );
};

export const FiltersLayout = (props: {
  children: React.ReactNode;
  fullHeight?: boolean;
}) => {
  return (
    <Grid
      container
      style={{
        position: 'relative',
        height: props.fullHeight ? '100%' : 'auto',
      }}
    >
      {props.children}
    </Grid>
  );
};

FiltersLayout.Filters = Filters;
FiltersLayout.Content = Content;
