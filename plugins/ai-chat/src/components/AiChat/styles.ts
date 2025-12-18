import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';

export const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxHeight: 'calc(100vh - 200px)',
      minHeight: '500px',
      backgroundColor: theme.palette.background.paper,
      borderRadius: theme.shape.borderRadius,
      overflow: 'hidden',
    },
    messagesContainer: {
      flex: 1,
      overflowY: 'auto',
      padding: theme.spacing(2),
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(2),
    },
    welcomeContainer: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing(4),
      textAlign: 'center',
    },
    welcomeTitle: {
      fontSize: '1.5rem',
      fontWeight: 600,
      marginBottom: theme.spacing(1),
    },
    welcomeSubtitle: {
      fontSize: '1.25rem',
      color: theme.palette.text.secondary,
    },
    userMessage: {
      alignSelf: 'flex-end',
      maxWidth: '80%',
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
      padding: theme.spacing(1.5, 2),
      borderRadius: theme.spacing(2),
      borderBottomRightRadius: theme.spacing(0.5),
    },
    assistantMessage: {
      alignSelf: 'flex-start',
      maxWidth: '80%',
      backgroundColor: theme.palette.background.default,
      padding: theme.spacing(1.5, 2),
      borderRadius: theme.spacing(2),
      borderBottomLeftRadius: theme.spacing(0.5),
      '& pre': {
        backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
        padding: theme.spacing(1.5),
        borderRadius: theme.shape.borderRadius,
        overflowX: 'auto',
        margin: theme.spacing(1, 0),
      },
      '& code': {
        fontFamily: 'monospace',
        fontSize: '0.875rem',
      },
      '& p': {
        margin: theme.spacing(0.5, 0),
      },
      '& ul, & ol': {
        marginLeft: theme.spacing(2),
        marginTop: theme.spacing(0.5),
        marginBottom: theme.spacing(0.5),
      },
    },
    composerContainer: {
      borderTop: `1px solid ${theme.palette.divider}`,
      padding: theme.spacing(2),
      backgroundColor: theme.palette.background.paper,
    },
    composerForm: {
      display: 'flex',
      gap: theme.spacing(1),
      alignItems: 'flex-end',
    },
    composerInput: {
      flex: 1,
      '& .MuiOutlinedInput-root': {
        borderRadius: theme.spacing(3),
      },
    },
    sendButton: {
      borderRadius: '50%',
      minWidth: 48,
      width: 48,
      height: 48,
    },
    stopButton: {
      borderRadius: '50%',
      minWidth: 48,
      width: 48,
      height: 48,
      backgroundColor: theme.palette.error.main,
      color: theme.palette.error.contrastText,
      '&:hover': {
        backgroundColor: theme.palette.error.dark,
      },
    },
    messageActions: {
      display: 'flex',
      gap: theme.spacing(0.5),
      marginTop: theme.spacing(0.5),
      opacity: 0.6,
      '&:hover': {
        opacity: 1,
      },
    },
    actionButton: {
      padding: theme.spacing(0.5),
      minWidth: 'auto',
    },
    loadingIndicator: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      color: theme.palette.text.secondary,
      padding: theme.spacing(1),
    },
    errorMessage: {
      backgroundColor: theme.palette.error.light,
      color: theme.palette.error.contrastText,
      padding: theme.spacing(1.5, 2),
      borderRadius: theme.shape.borderRadius,
      marginTop: theme.spacing(1),
    },
  }),
);
