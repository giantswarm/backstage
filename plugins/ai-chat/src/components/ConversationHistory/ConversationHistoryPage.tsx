import { Content } from '@backstage/core-components';
import {
  Button,
  ButtonIcon,
  Cell,
  CellText,
  ColumnConfig,
  Menu,
  MenuItem,
  MenuSeparator,
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
import {
  DeleteConversationDialog,
  DeleteConversationsDialog,
} from '../DeleteConversationDialog';
import type { ConversationApi, ConversationListItem } from '../../api';
import { formatRelativeDate, getConversationTitle } from '../../utils';
import type { Selection } from 'react-aria-components';

const useStyles = makeStyles(theme => ({
  emptyState: {
    textAlign: 'center' as const,
    padding: theme.spacing(2),
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
  selectionToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
}));

interface ConversationHistoryPageProps {
  conversationApi: ConversationApi;
  activeId?: string;
  onSelectConversation: (id: string) => void;
}

export const ConversationHistoryPage = ({
  conversationApi,
  activeId,
  onSelectConversation,
}: ConversationHistoryPageProps) => {
  const classes = useStyles();
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [pendingDelete, setPendingDelete] =
    useState<ConversationListItem | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(
    null,
  );
  const {
    conversations,
    loading,
    deleteConversation,
    deleteConversations,
    toggleStar,
  } = useConversations(conversationApi);

  const selectedIds: string[] =
    selectedKeys === 'all'
      ? conversations.map(c => c.id)
      : Array.from(selectedKeys, String);

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
                <MenuSeparator />
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
    <Content>
      <div className={classes.selectionToolbar}>
        <Button
          variant="tertiary"
          size="small"
          iconStart={<RiDeleteBinLine size={16} />}
          onClick={() => setPendingBulkDelete(selectedIds)}
          isDisabled={selectedIds.length === 0}
        >
          {selectedIds.length > 0 ? 'Delete selected' : 'Delete'}
        </Button>
      </div>
      <Table
        columnConfig={columnConfig}
        data={conversations}
        loading={loading}
        pagination={{ type: 'none' }}
        selection={{
          mode: 'multiple',
          behavior: 'toggle',
          selected: selectedKeys,
          onSelectionChange: setSelectedKeys,
        }}
        rowConfig={{
          onClick: item => onSelectConversation(item.id),
        }}
        emptyState={
          <div className={classes.emptyState}>
            <Text variant="body-medium">No conversations found</Text>
          </div>
        }
      />
      <DeleteConversationDialog
        conversation={pendingDelete}
        onConfirm={() => {
          if (pendingDelete) deleteConversation(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      <DeleteConversationsDialog
        count={pendingBulkDelete?.length ?? null}
        onConfirm={() => {
          if (pendingBulkDelete) {
            deleteConversations(pendingBulkDelete);
            setSelectedKeys(new Set());
          }
          setPendingBulkDelete(null);
        }}
        onCancel={() => setPendingBulkDelete(null)}
      />
    </Content>
  );
};
