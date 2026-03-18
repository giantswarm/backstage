import { Fab, makeStyles, Tooltip } from '@material-ui/core';
import { useApiHolder, useRouteRef } from '@backstage/core-plugin-api';
import { useLocation } from 'react-router-dom';
import {
  AIChatIcon,
  aiChatDrawerApiRef,
  rootRouteRef,
} from '@giantswarm/backstage-plugin-ai-chat-react';

const useStyles = makeStyles(theme => ({
  fab: {
    position: 'fixed',
    bottom: theme.spacing(3),
    right: theme.spacing(3),
    zIndex: theme.zIndex.speedDial,
    [theme.breakpoints.down('xs')]: {
      bottom: theme.spacing(3) + 56,
    },
  },
}));

export const AiChatFab = () => {
  const classes = useStyles();
  const apiHolder = useApiHolder();
  const chatPath = useRouteRef(rootRouteRef);
  const { pathname } = useLocation();

  const drawerApi = apiHolder.get(aiChatDrawerApiRef);

  if (!drawerApi || pathname.startsWith(chatPath())) {
    return null;
  }

  return (
    <Tooltip title="Open AI Assistant">
      <Fab
        className={classes.fab}
        color="primary"
        size="medium"
        aria-label="Open AI Assistant"
        onClick={() => drawerApi.openDrawer()}
      >
        <AIChatIcon />
      </Fab>
    </Tooltip>
  );
};
