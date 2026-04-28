import {
  ButtonIcon,
  Cell,
  CellText,
  ColumnConfig,
  Menu,
  MenuItem,
  MenuTrigger,
  Table,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  RiDeleteBinLine,
  RiMoreLine,
  RiStarFill,
  RiStarLine,
} from '@remixicon/react';
import { useState } from 'react';
import { useConversations } from '../../hooks/useConversations';
import { DeleteConversationDialog } from '../DeleteConversationDialog';
import type { ConversationApi, ConversationListItem } from '../../api';
import { getConversationTitle } from '../../utils';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  tableContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing(3),
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: theme.spacing(4),
  },
  starIcon: {
    color: theme.palette.warning.main,
  },
  actionsContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: '100%',
  },
  activeTitle: {
    '& p[data-weight="regular"]': {
      fontWeight: 'var(--bui-font-weight-bold)',
    },
  },
}));

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface DrawerConversationHistoryProps {
  conversationApi: ConversationApi;
  activeId?: string;
  onSelectConversation: (id: string) => void;
}

export const DrawerConversationHistory = ({
  conversationApi,
  activeId,
  onSelectConversation,
}: DrawerConversationHistoryProps) => {
  const classes = useStyles();
  const { conversations, loading, deleteConversation, toggleStar } =
    useConversations(conversationApi);
  const [pendingDelete, setPendingDelete] =
    useState<ConversationListItem | null>(null);

  const columnConfig: ColumnConfig<ConversationListItem>[] = [
    {
      id: 'title',
      label: 'Title',
      isRowHeader: true,
      cell: item => (
        <CellText
          className={item.id === activeId ? classes.activeTitle : undefined}
          title={getConversationTitle(item)}
          description={formatRelativeDate(item.updatedAt)}
        />
      ),
    },
    {
      id: 'starred',
      label: '',
      width: 32,
      cell: item => (
        <Cell>
          {item.isStarred && (
            <RiStarFill size={16} className={classes.starIcon} />
          )}
        </Cell>
      ),
    },
    {
      id: 'actions',
      label: '',
      width: 48,
      cell: item => (
        <Cell>
          <div className={classes.actionsContainer}>
            <MenuTrigger>
              <ButtonIcon
                icon={<RiMoreLine />}
                aria-label="Actions"
                variant="tertiary"
                size="small"
              />
              <Menu>
                <MenuItem
                  onAction={() => toggleStar(item.id)}
                  iconStart={
                    item.isStarred ? (
                      <RiStarLine size={16} />
                    ) : (
                      <RiStarFill size={16} />
                    )
                  }
                >
                  {item.isStarred ? 'Unstar' : 'Star'}
                </MenuItem>
                <MenuItem
                  onAction={() => setPendingDelete(item)}
                  iconStart={<RiDeleteBinLine size={16} />}
                  color="danger"
                >
                  Delete
                </MenuItem>
              </Menu>
            </MenuTrigger>
          </div>
        </Cell>
      ),
    },
  ];

  return (
    <div className={classes.root}>
      <div className={classes.tableContainer}>
        <Table
          columnConfig={columnConfig}
          data={conversations}
          loading={loading}
          pagination={{ type: 'none' }}
          rowConfig={{
            onClick: item => onSelectConversation(item.id),
          }}
          emptyState={
            <div className={classes.emptyState}>
              <Text variant="body-small">No conversations found</Text>
            </div>
          }
        />
      </div>
      <DeleteConversationDialog
        conversation={pendingDelete}
        onConfirm={() => {
          if (pendingDelete) deleteConversation(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
