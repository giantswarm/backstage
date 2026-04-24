import {
  ButtonIcon,
  Cell,
  CellText,
  ColumnConfig,
  Menu,
  MenuItem,
  MenuTrigger,
  SearchAutocomplete,
  SearchAutocompleteItem,
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
import { useConversations } from '../../hooks/useConversations';
import type { ConversationApi, ConversationListItem } from '../../api';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  searchContainer: {
    padding: theme.spacing(2),
    flexShrink: 0,
  },
  tableContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing(0, 2, 2),
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

interface DrawerConversationHistoryProps {
  conversationApi: ConversationApi;
  onSelectConversation: (id: string) => void;
}

export const DrawerConversationHistory = ({
  conversationApi,
  onSelectConversation,
}: DrawerConversationHistoryProps) => {
  const classes = useStyles();
  const {
    starredConversations,
    recentConversations,
    loading,
    searchQuery,
    setSearchQuery,
    deleteConversation,
    toggleStar,
  } = useConversations(conversationApi);

  const allConversations = [...starredConversations, ...recentConversations];

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

  return (
    <div className={classes.root}>
      <div className={classes.searchContainer}>
        <SearchAutocomplete
          aria-label="Search conversations"
          inputValue={searchQuery}
          onInputChange={setSearchQuery}
          placeholder="Search conversations..."
          size="medium"
        >
          {allConversations
            .filter(
              c =>
                searchQuery.length >= 2 &&
                c.title?.toLowerCase().includes(searchQuery.toLowerCase()),
            )
            .slice(0, 10)
            .map(conv => (
              <SearchAutocompleteItem
                key={conv.id}
                id={conv.id}
                textValue={
                  conv.title || conv.preview || 'Untitled conversation'
                }
                onAction={() => onSelectConversation(conv.id)}
              >
                {conv.title || conv.preview || 'Untitled conversation'}
              </SearchAutocompleteItem>
            ))}
        </SearchAutocomplete>
      </div>

      <div className={classes.tableContainer}>
        <Table
          columnConfig={columnConfig}
          data={allConversations}
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
    </div>
  );
};
