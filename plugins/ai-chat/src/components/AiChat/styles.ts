import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';

export const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    '@keyframes fadeInUp': {
      from: {
        opacity: 0,
        transform: 'translateY(8px)',
      },
      to: {
        opacity: 1,
        transform: 'translateY(0)',
      },
    },
    root: {
      display: 'flex',
      flexGrow: 1,
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      maxWidth: '800px',
      minHeight: '500px',
      backgroundColor: 'var(--bui-bg-neutral-1)',
      borderRadius: 'var(--bui-radius-3)',
    },
    messagesContainer: {
      flex: 1,
      overflowY: 'auto',
      padding: theme.spacing(2, 2, 10),
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
    suggestionsContainer: {
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing(1.5),
      marginTop: theme.spacing(3),
      width: '100%',
      justifyContent: 'center',
    },
    suggestionCard: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing(2, 3),
      backgroundColor: 'var(--bui-bg-neutral-2)',
      border: `2px solid ${theme.palette.divider}`,
      borderRadius: 'var(--bui-radius-3)',
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      flex: '1 1 200px',
      maxWidth: 250,
      minHeight: 120,
      '&:hover': {
        backgroundColor: theme.palette.action.hover,
        borderColor: theme.palette.primary.main,
      },
      '&:focus': {
        outline: 'none',
        borderColor: theme.palette.primary.main,
        boxShadow: `0 0 0 2px ${theme.palette.primary.light}`,
      },
    },
    suggestionText: {
      fontSize: '0.95rem',
      color: theme.palette.text.primary,
      textAlign: 'center',
    },
    userMessage: {
      animation: '$fadeInUp 0.3s ease-out',
      justifySelf: 'flex-end',
      maxWidth: 'calc(100% - 65px)',
      backgroundColor: 'var(--bui-bg-neutral-2)',
      padding: theme.spacing(1.5, 2),
      borderRadius: 'var(--bui-radius-3)',

      '& p': {
        margin: 0,
      },
    },
    assistantMessage: {},
    composerContainer: {},
    composerContainerSticky: {
      position: 'sticky',
      bottom: 0,
      zIndex: 1,
      paddingBottom: theme.spacing(3),
      backgroundColor: 'var(--bui-bg-app)',
    },
    composerContainerInner: {
      borderTop: '1px solid var(--bui-border-1)',
      padding: theme.spacing(2),
      backgroundColor: theme.palette.background.paper,
    },
    composerContainerInnerSticky: {
      borderRadius: '0 0 var(--bui-radius-3) var(--bui-radius-3)',
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

      '& > button': {
        border: 'none',
        background: 'none',
        padding: 0,
        font: 'inherit',
        cursor: 'pointer',
        outline: 'inherit',
      },
    },
    messageActions: {
      display: 'flex',
      gap: theme.spacing(0.5),

      '&[data-floating]': {
        position: 'absolute',
        zIndex: 1,
      },

      '& > button': {
        border: 'none',
        background: 'none',
        padding: 0,
        font: 'inherit',
        cursor: 'pointer',
        outline: 'inherit',
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
      borderRadius: 'var(--bui-radius-3)',
      marginTop: theme.spacing(1),
    },
  }),
);
