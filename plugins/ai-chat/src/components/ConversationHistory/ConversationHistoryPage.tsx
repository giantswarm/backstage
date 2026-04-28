import { Content } from '@backstage/core-components';
import { Button, useTable } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { RiDeleteBinLine } from '@remixicon/react';
import { useState } from 'react';
import type { Selection } from 'react-aria-components';
import type { ConversationApi, ConversationListItem } from '../../api';
import { useConversations } from '../../hooks/useConversations';
import { ConversationHistoryTable } from '../ConversationHistoryTable';
import { DeleteConversationsDialog } from '../DeleteConversationDialog';

const useStyles = makeStyles(theme => ({
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
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(
    null,
  );
  const { conversations, deleteConversations } =
    useConversations(conversationApi);

  const { tableProps } = useTable<ConversationListItem>({
    mode: 'complete',
    data: conversations,
  });

  const selectedIds: string[] =
    selectedKeys === 'all'
      ? conversations.map(c => c.id)
      : Array.from(selectedKeys, String);

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
      <ConversationHistoryTable
        conversationApi={conversationApi}
        activeId={activeId}
        onSelectConversation={onSelectConversation}
        tableProps={tableProps}
        selection={{
          mode: 'multiple',
          behavior: 'toggle',
          selected: selectedKeys,
          onSelectionChange: setSelectedKeys,
        }}
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
