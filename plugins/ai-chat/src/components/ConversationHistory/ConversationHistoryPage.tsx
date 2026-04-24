import { Content } from '@backstage/core-components';
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
import type { ConversationApi, ConversationListItem } from '../../api';
import type { Selection } from 'react-aria-components';

const useStyles = makeStyles(theme => ({
  root: {},
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionHeader: {
    marginBottom: theme.spacing(1),
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: theme.spacing(4),
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

interface ConversationHistoryPageProps {
  conversationApi: ConversationApi;
  onSelectConversation: (id: string) => void;
}

export const ConversationHistoryPage = ({
  conversationApi,
  onSelectConversation,
}: ConversationHistoryPageProps) => {
  const classes = useStyles();
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const {
    starredConversations,
    recentConversations,
    loading,
    deleteConversation,
    toggleStar,
  } = useConversations(conversationApi);

  const columnConfig: ColumnConfig<ConversationListItem>[] = [
    {
      id: 'title',
      label: 'Title',
      isRowHeader: true,
      cell: item => (
        <CellText
          title={item.title || item.preview || 'Untitled conversation'}
          description={formatRelativeDate(item.updatedAt)}
        />
      ),
    },
    {
      id: 'actions',
      label: '',
      width: 48,
      cell: item => (
        <Cell>
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
                onAction={() => deleteConversation(item.id)}
                iconStart={<RiDeleteBinLine size={16} />}
                color="danger"
              >
                Delete
              </MenuItem>
            </Menu>
          </MenuTrigger>
        </Cell>
      ),
    },
  ];

  const renderConversationTable = (items: ConversationListItem[]) => (
    <Table
      columnConfig={columnConfig}
      data={items}
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
          <Text variant="body-small">No conversations found</Text>
        </div>
      }
    />
  );

  return (
    <Content>
      <div className={classes.root}>
        {!loading && starredConversations.length > 0 && (
          <div className={classes.section}>
            <Text variant="body-small" className={classes.sectionHeader}>
              Starred
            </Text>
            {renderConversationTable(starredConversations)}
          </div>
        )}

        {!loading && (
          <div className={classes.section}>
            {starredConversations.length > 0 && (
              <Text variant="body-small" className={classes.sectionHeader}>
                Recent
              </Text>
            )}
            {renderConversationTable(recentConversations)}
          </div>
        )}
      </div>
    </Content>
  );
};
