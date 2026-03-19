import { Fab, makeStyles, Tooltip } from '@material-ui/core';
import {
  useApi,
  useApiHolder,
  useRouteRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { useEffect } from 'react';
import useAsync from 'react-use/esm/useAsync';
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
  const identityApi = useApi(identityApiRef);
  const chatPath = useRouteRef(rootRouteRef);
  const { pathname } = useLocation();

  const drawerApi = apiHolder.get(aiChatDrawerApiRef);

  const { value: identity } = useAsync(
    () => identityApi.getBackstageIdentity(),
    [identityApi],
  );

  // Inject a global <style> tag to add bottom padding so the FAB never
  // overlaps page content. Using a stylesheet (rather than inline styles)
  // ensures the rule survives content re-renders.
  useEffect(() => {
    if (!drawerApi) return undefined;

    const styleEl = document.createElement('style');
    styleEl.id = 'ai-chat-fab-padding';
    styleEl.textContent = '#root div main { padding-bottom: 72px !important; }';
    document.head.appendChild(styleEl);

    return () => {
      styleEl.remove();
    };
  }, [drawerApi]);

  if (
    !drawerApi ||
    pathname.startsWith(chatPath()) ||
    identity?.type !== 'user'
  ) {
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
