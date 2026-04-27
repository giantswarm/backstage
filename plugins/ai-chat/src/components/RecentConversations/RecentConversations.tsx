import { List, ListRow, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useEffect, useState } from 'react';
import type { Selection } from 'react-aria-components';
import type { ConversationApi } from '../../api';
import { useConversations } from '../../hooks/useConversations';

const HEADER_HEIGHT = 89;

const useStyles = makeStyles(theme => ({
  root: {
    position: 'sticky',
    top: 0,
    maxHeight: `calc(100dvh - ${HEADER_HEIGHT}px)`,
    overflowY: 'auto',
    padding: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  title: {
    padding: theme.spacing(0, 1),
  },
  empty: {
    padding: theme.spacing(0, 1),
  },
  list: {
    '& .bui-ListRowCheck': {
      display: 'none',
    },
    '& .bui-ListRow[data-selected]': {
      fontWeight: 'var(--bui-font-weight-bold)',
      backgroundColor: 'transparent',
    },
    '& .bui-ListRow[data-selected][data-hovered], & .bui-ListRow[data-selected][data-focus-visible]':
      {
        backgroundColor: 'var(--bui-bg-neutral-1-hover)',
      },
    '& .bui-ListRow[data-selected][data-pressed]': {
      backgroundColor: 'var(--bui-bg-neutral-1-pressed)',
    },
  },
}));

interface RecentConversationsProps {
  conversationApi: ConversationApi;
  selectedId?: string;
  onSelectConversation: (id: string) => void;
}

const toSelection = (id?: string): Selection =>
  id ? new Set([id]) : new Set();

export const RecentConversations = ({
  conversationApi,
  selectedId,
  onSelectConversation,
}: RecentConversationsProps) => {
  const classes = useStyles();
  const { conversations, loading } = useConversations(conversationApi);
  const [selected, setSelected] = useState<Selection>(toSelection(selectedId));

  useEffect(() => {
    setSelected(toSelection(selectedId));
  }, [selectedId]);

  const handleSelectionChange = (selection: Selection) => {
    setSelected(selection);
    if (selection === 'all' || selection.size === 0) return;
    const id = String(selection.values().next().value);
    if (id !== selectedId) {
      onSelectConversation(id);
    }
  };

  return (
    <div className={classes.root}>
      <Text variant="body-medium" color="secondary" className={classes.title}>
        Recents:
      </Text>
      <List
        aria-label="Recent conversations"
        items={conversations}
        className={classes.list}
        selectionMode="single"
        selectedKeys={selected}
        onSelectionChange={handleSelectionChange}
        renderEmptyState={() =>
          loading ? null : (
            <Text
              variant="body-small"
              color="secondary"
              className={classes.empty}
            >
              No recent conversations
            </Text>
          )
        }
      >
        {item => (
          <ListRow id={item.id}>
            {item.title || item.preview || 'Untitled conversation'}
          </ListRow>
        )}
      </List>
    </div>
  );
};
