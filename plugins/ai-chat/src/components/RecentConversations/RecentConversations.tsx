import { Link as BackstageLink } from '@backstage/core-components';
import { List, ListRow, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useEffect, useState } from 'react';
import type { Selection } from 'react-aria-components';
import type { ConversationApi } from '../../api';
import { useConversations } from '../../hooks/useConversations';
import { useContainerDimensions } from '@giantswarm/backstage-plugin-ui-react';

// Parent chrome the sidebar sits beneath. Update if either changes.
const PLUGIN_HEADER_HEIGHT = 89; // <PluginHeader> from @backstage/ui
const CONTENT_PADDING = 24; // <Content> from @backstage/core-components
const VIEWPORT_OFFSET = PLUGIN_HEADER_HEIGHT + CONTENT_PADDING;
const ITEM_HEIGHT = 32;
const LINK_HEIGHT = 24; // "+N more" Text (body-small) + marginTop

const useStyles = makeStyles(theme => ({
  root: {
    position: 'sticky',
    top: 0,
    height: '100%',
    maxHeight: `calc(100dvh - ${VIEWPORT_OFFSET}px)`,
    padding: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  title: {
    padding: theme.spacing(0, 1),
  },
  more: {
    display: 'inline-block',
    marginTop: theme.spacing(1),
    padding: theme.spacing(0, 1),
    '& a': {
      color: theme.palette.text.primary,
    },
  },
  listContainer: {
    flex: 1,
    minHeight: 0,
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
  historyPath: string;
}

const toSelection = (id?: string): Selection =>
  id ? new Set([id]) : new Set();

export const RecentConversations = ({
  conversationApi,
  selectedId,
  onSelectConversation,
  historyPath,
}: RecentConversationsProps) => {
  const classes = useStyles();
  const [containerRef, dimensions] = useContainerDimensions();
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

  if (loading || conversations.length === 0) {
    return null;
  }

  const allItemsFit = conversations.length * ITEM_HEIGHT <= dimensions.height;
  // When the "+N more" link is shown, reserve only its actual height so the
  // list shrinks one item at a time (instead of jumping by two when crossing
  // the all-fit boundary).
  const itemsToShow = allItemsFit
    ? conversations.length
    : Math.max(0, Math.floor((dimensions.height - LINK_HEIGHT) / ITEM_HEIGHT));
  const visibleConversations = conversations.slice(0, itemsToShow);
  const hiddenCount = conversations.length - visibleConversations.length;

  // Not enough room for even one item — hide the component but keep the
  // measurement div mounted so the ResizeObserver picks up future resizes.
  const tooShort = dimensions.height > 0 && itemsToShow === 0;

  return (
    <div
      className={classes.root}
      style={tooShort ? { visibility: 'hidden' } : undefined}
    >
      {/* Always rendered so listContainer's measured height is independent of
          tooShort, otherwise hiding the title shrinks/grows the measurement
          area and oscillates around the boundary. */}
      <Text variant="body-medium" color="secondary" className={classes.title}>
        Recents:
      </Text>
      <div className={classes.listContainer} ref={containerRef}>
        {!tooShort && dimensions.height > 0 && (
          <>
            <List
              aria-label="Recent conversations"
              items={visibleConversations}
              className={classes.list}
              selectionMode="single"
              selectedKeys={selected}
              onSelectionChange={handleSelectionChange}
            >
              {item => (
                <ListRow id={item.id}>
                  {item.title || item.preview || 'Untitled conversation'}
                </ListRow>
              )}
            </List>
            {hiddenCount > 0 && (
              <Text
                variant="body-small"
                color="secondary"
                className={classes.more}
              >
                <BackstageLink to={historyPath}>
                  +{hiddenCount} more
                </BackstageLink>
              </Text>
            )}
          </>
        )}
      </div>
    </div>
  );
};
