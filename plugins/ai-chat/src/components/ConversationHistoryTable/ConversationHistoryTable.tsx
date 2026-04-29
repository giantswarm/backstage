import {
  ButtonIcon,
  Cell,
  CellText,
  ColumnConfig,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Table,
  TablePaginationType,
  TableSelection,
  Text,
  UseTableResult,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  RiDeleteBinLine,
  RiEditLine,
  RiMoreLine,
  RiStarFill,
  RiStarLine,
} from '@remixicon/react';
import { useState } from 'react';
import type { ConversationApi, ConversationListItem } from '../../api';
import { useConversations } from '../../hooks/useConversations';
import { formatRelativeDate, getConversationTitle } from '../../utils';
import { DeleteConversationDialog } from '../DeleteConversationDialog';
import { RenameConversationDialog } from '../RenameConversationDialog';

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
}));

export interface ConversationHistoryTableProps {
  conversationApi: ConversationApi;
  activeId?: string;
  onSelectConversation: (id: string) => void;
  /**
   * Forwarded to `<Table>`. Pass either this (when the consumer manages
   * pagination/sort via `useTable`) or `pagination` — not both.
   */
  tableProps?: UseTableResult<ConversationListItem>['tableProps'];
  /** Required when `tableProps` is not provided. */
  pagination?: TablePaginationType;
  selection?: TableSelection;
}

export const ConversationHistoryTable = ({
  conversationApi,
  activeId,
  onSelectConversation,
  tableProps,
  pagination,
  selection,
}: ConversationHistoryTableProps) => {
  const classes = useStyles();
  const {
    conversations,
    loading,
    deleteConversation,
    toggleStar,
    renameConversation,
  } = useConversations(conversationApi);
  const [pendingDelete, setPendingDelete] =
    useState<ConversationListItem | null>(null);
  const [pendingRename, setPendingRename] =
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
                  style={{ display: 'none' }}
                >
                  {item.isStarred ? 'Unstar' : 'Star'}
                </MenuItem>
                <MenuItem
                  onAction={() => setPendingRename(item)}
                  iconStart={<RiEditLine size={16} />}
                >
                  Rename
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

  const emptyState = (
    <div className={classes.emptyState}>
      <Text variant="body-medium">No conversations found</Text>
    </div>
  );

  const sharedTableProps = {
    columnConfig,
    selection,
    rowConfig: {
      onClick: (item: ConversationListItem) => onSelectConversation(item.id),
    },
    emptyState,
  };

  return (
    <>
      {tableProps ? (
        <Table
          {...tableProps}
          {...sharedTableProps}
          loading={loading || tableProps.loading}
        />
      ) : (
        <Table
          {...sharedTableProps}
          data={conversations}
          loading={loading}
          pagination={pagination ?? { type: 'none' }}
        />
      )}
      <DeleteConversationDialog
        conversation={pendingDelete}
        onConfirm={() => {
          if (pendingDelete) deleteConversation(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      <RenameConversationDialog
        conversation={pendingRename}
        onConfirm={title => {
          if (pendingRename) renameConversation(pendingRename.id, title);
          setPendingRename(null);
        }}
        onCancel={() => setPendingRename(null)}
      />
    </>
  );
};
