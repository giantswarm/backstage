import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';

export const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxWidth: '600px',
      minHeight: '500px',
      backgroundColor: theme.palette.background.paper,
      boxShadow: theme.shadows[2],
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
      '& > div': {
        position: 'relative',
      },
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
      justifySelf: 'flex-end',
      maxWidth: 'calc(100% - 65px)',
      backgroundColor: theme.palette.background.default,
      padding: theme.spacing(1.5, 2),
      borderRadius: theme.shape.borderRadius,
    },
    assistantMessage: {
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
      alignItems: 'center',
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
    messageActionsContainer: {
      display: 'flex',
      gap: theme.spacing(1),
      paddingTop: theme.spacing(0.5),
    },
    branchPicker: {
      display: 'inline-flex',
      gap: theme.spacing(0.5),
      alignItems: 'center',
    },
    messageActions: {
      display: 'flex',
      gap: theme.spacing(0.5),

      '&[data-floating]': {
        position: 'absolute',
        zIndex: 1,
      },
    },
    actionButton: {
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
