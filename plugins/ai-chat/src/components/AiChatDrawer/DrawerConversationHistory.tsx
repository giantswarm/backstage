import { makeStyles } from '@material-ui/core';
import type { ConversationApi } from '../../api';
import { ConversationHistoryTable } from '../ConversationHistoryTable';

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
}));

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

  return (
    <div className={classes.root}>
      <div className={classes.tableContainer}>
        <ConversationHistoryTable
          conversationApi={conversationApi}
          activeId={activeId}
          onSelectConversation={onSelectConversation}
          pagination={{ type: 'none' }}
        />
      </div>
    </div>
  );
};
