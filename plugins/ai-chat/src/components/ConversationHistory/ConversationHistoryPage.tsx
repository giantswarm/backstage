import { Content } from '@backstage/core-components';
import {
  List,
  ListRow,
  MenuItem,
  SearchAutocomplete,
  SearchAutocompleteItem,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  RiDeleteBinLine,
  RiStarFill,
  RiStarLine,
  RiChat1Line,
} from '@remixicon/react';
import { useConversations } from '../../hooks/useConversations';
import type { ConversationApi, ConversationListItem } from '../../api';

const useStyles = makeStyles(theme => ({
  root: {
    maxWidth: 800,
    margin: '0 auto',
    paddingTop: theme.spacing(2),
  },
  searchContainer: {
    marginBottom: theme.spacing(2),
  },
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
  const {
    starredConversations,
    recentConversations,
    loading,
    searchQuery,
    setSearchQuery,
    deleteConversation,
    toggleStar,
  } = useConversations(conversationApi);

  const renderConversationList = (items: ConversationListItem[]) => (
    <List
      items={items}
      selectionMode="none"
      renderEmptyState={() => (
        <div className={classes.emptyState}>
          <Text variant="body-small">No conversations found</Text>
        </div>
      )}
    >
      {items.map(conv => (
        <ListRow
          key={conv.id}
          id={conv.id}
          textValue={conv.title || 'Untitled conversation'}
          icon={<RiChat1Line size={20} />}
          description={formatRelativeDate(conv.updatedAt)}
          onAction={() => onSelectConversation(conv.id)}
          menuItems={
            <>
              <MenuItem onAction={() => toggleStar(conv.id)}>
                {conv.isStarred ? (
                  <>
                    <RiStarLine size={16} /> Unstar
                  </>
                ) : (
                  <>
                    <RiStarFill size={16} /> Star
                  </>
                )}
              </MenuItem>
              <MenuItem onAction={() => deleteConversation(conv.id)}>
                <RiDeleteBinLine size={16} /> Delete
              </MenuItem>
            </>
          }
        >
          {conv.title || 'Untitled conversation'}
        </ListRow>
      ))}
    </List>
  );

  const allConversations = [...starredConversations, ...recentConversations];

  return (
    <Content>
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
                  textValue={conv.title || 'Untitled conversation'}
                  onAction={() => onSelectConversation(conv.id)}
                >
                  {conv.title || 'Untitled conversation'}
                </SearchAutocompleteItem>
              ))}
          </SearchAutocomplete>
        </div>

        {loading && (
          <div className={classes.emptyState}>
            <Text variant="body-small">Loading conversations...</Text>
          </div>
        )}

        {!loading && starredConversations.length > 0 && (
          <div className={classes.section}>
            <Text variant="body-small" className={classes.sectionHeader}>
              Starred
            </Text>
            {renderConversationList(starredConversations)}
          </div>
        )}

        {!loading && (
          <div className={classes.section}>
            {starredConversations.length > 0 && (
              <Text variant="body-small" className={classes.sectionHeader}>
                Recent
              </Text>
            )}
            {renderConversationList(recentConversations)}
          </div>
        )}
      </div>
    </Content>
  );
};
