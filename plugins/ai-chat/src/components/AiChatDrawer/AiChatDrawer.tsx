import { makeStyles } from '@material-ui/core';
import {
  Box,
  Button,
  ButtonIcon,
  PluginHeader,
  Tab,
  TabList,
  Tabs,
} from '@backstage/ui';
import { RiAddLine, RiCloseLine } from '@remixicon/react';

import { Thread } from '../AiChat/Thread';
import { DrawerConversationHistory } from './DrawerConversationHistory';
import { DEFAULT_WIDTH, useDrawerResize } from './useDrawerResize';
import {
  AIChatIcon,
  rootRouteRef,
} from '@giantswarm/backstage-plugin-ai-chat-react';
import { routeResolutionApiRef, useApi } from '@backstage/frontend-plugin-api';
import type { DrawerTab } from './AiChatDrawerProvider';
import type { ConversationApi } from '../../api';
import type { Key } from 'react';

const useStyles = makeStyles(theme => ({
  drawer: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: DEFAULT_WIDTH,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bui-bg-app)',
    borderLeft: `1px solid ${theme.palette.divider}`,
    zIndex: theme.zIndex.appBar,
    [theme.breakpoints.down('xs')]: {
      width: '100vw',
    },
  },
  resizeHandle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 6,
    height: '100%',
    cursor: 'col-resize',
    zIndex: 1,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    [theme.breakpoints.down('xs')]: {
      display: 'none',
    },
  },
  resizeHandleDragging: {
    backgroundColor: theme.palette.primary.main,
    opacity: 0.3,
  },
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: theme.zIndex.appBar - 1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    flexShrink: 0,
  },
  threadRoot: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  historyContent: {
    flex: 1,
    overflow: 'hidden',
  },
}));

export type AiChatDrawerVariant = 'persistent' | 'overlay';

interface AiChatDrawerProps {
  open: boolean;
  onClose(): void;
  onNewConversation(): void;
  variant: AiChatDrawerVariant;
  activeTab: DrawerTab;
  onTabChange(tab: DrawerTab): void;
  conversationApi: ConversationApi;
  activeConversationId?: string;
  onSelectConversation(id: string): void;
}

export const AiChatDrawer = ({
  open,
  onClose,
  onNewConversation,
  variant,
  activeTab,
  onTabChange,
  conversationApi,
  activeConversationId,
  onSelectConversation,
}: AiChatDrawerProps) => {
  const classes = useStyles();
  const routeResolutionApi = useApi(routeResolutionApiRef);
  const chatPath = routeResolutionApi.resolve(rootRouteRef)?.();
  const { width, drawerRef, resizeHandleProps, isDragging } = useDrawerResize({
    variant,
    open,
  });

  if (!open) {
    return null;
  }

  return (
    <>
      {variant === 'overlay' && (
        <div
          className={classes.backdrop}
          role="button"
          tabIndex={0}
          aria-label="Close AI chat"
          onClick={onClose}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
              onClose();
            }
          }}
        />
      )}
      <div
        ref={drawerRef}
        className={classes.drawer}
        style={width ? { width } : undefined}
      >
        <div
          className={`${classes.resizeHandle}${isDragging ? ` ${classes.resizeHandleDragging}` : ''}`}
          {...resizeHandleProps}
        />
        <PluginHeader
          title="AI Assistant"
          titleLink={chatPath}
          icon={<AIChatIcon fontSize="inherit" />}
          customActions={
            <>
              <Button
                variant="tertiary"
                iconStart={<RiAddLine />}
                onClick={onNewConversation}
              >
                New chat
              </Button>
              <ButtonIcon
                variant="tertiary"
                icon={<RiCloseLine />}
                onClick={onClose}
              />
            </>
          }
        />
        <Box
          bg="neutral"
          style={{
            paddingInline: 'var(--bui-space-3)',
            borderBottom: '1px solid var(--bui-border-1)',
          }}
        >
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key: Key) => onTabChange(key as DrawerTab)}
          >
            <TabList>
              <Tab id="chat">Chat</Tab>
              <Tab id="history">History</Tab>
            </TabList>
          </Tabs>
        </Box>
        <Thread
          className={classes.threadRoot}
          isSticky={false}
          style={{
            display: activeTab === 'chat' ? undefined : 'none',
          }}
        />
        {activeTab === 'history' && (
          <div className={classes.historyContent}>
            <DrawerConversationHistory
              conversationApi={conversationApi}
              activeId={activeConversationId}
              onSelectConversation={onSelectConversation}
            />
          </div>
        )}
      </div>
    </>
  );
};
