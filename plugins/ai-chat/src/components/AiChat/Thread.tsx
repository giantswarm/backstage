import { useState, useMemo } from 'react';
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  useAssistantApi,
} from '@assistant-ui/react';
import { useApi, featureFlagsApiRef } from '@backstage/core-plugin-api';
import IconButton from '@material-ui/core/IconButton';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import ButtonBase from '@material-ui/core/ButtonBase';
import Typography from '@material-ui/core/Typography';
import Tooltip from '@material-ui/core/Tooltip';
import CircularProgress from '@material-ui/core/CircularProgress';
import SendIcon from '@material-ui/icons/Send';
import StopIcon from '@material-ui/icons/Stop';
import ContentCopyIcon from '@material-ui/icons/FileCopyOutlined';
import RefreshIcon from '@material-ui/icons/Refresh';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import CheckIcon from '@material-ui/icons/Check';
import { useStyles } from './styles';
import {
  Reasoning,
  ReasoningGroup,
  MarkdownText,
  ToolFallback,
  ToolGroup,
} from './assistant-ui-components';

const EXAMPLE_QUESTIONS = [
  'What applications are available for deployment?',
  'Are there any clusters unhealthy right now?',
  'Who are my team mates?',
  "What are my organization's workload clusters?",
  "Show me one of the applications I own and where it's deployed",
  'What tools do you have available?',
  'What can I do here in the portal?',
];

const ThreadWelcome = () => {
  const classes = useStyles();
  const api = useAssistantApi();

  const selectedQuestions = useMemo(() => {
    const shuffled = [...EXAMPLE_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, []);

  const handleSuggestionClick = (question: string) => {
    api
      .thread()
      .append({ role: 'user', content: [{ type: 'text', text: question }] });
  };

  return (
    <div className={classes.welcomeContainer}>
      <Typography className={classes.welcomeTitle}>
        How can I help you today?
      </Typography>
      <Typography className={classes.welcomeSubtitle}>
        Not sure what to do here? Try one of these questions.
      </Typography>
      <div className={classes.suggestionsContainer}>
        {selectedQuestions.map(question => (
          <ButtonBase
            key={question}
            className={classes.suggestionCard}
            onClick={() => handleSuggestionClick(question)}
          >
            <Typography className={classes.suggestionText}>
              {question}
            </Typography>
          </ButtonBase>
        ))}
      </div>
    </div>
  );
};

const BranchPicker = () => {
  const classes = useStyles();

  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={classes.branchPicker}
    >
      <BranchPickerPrimitive.Previous>
        <Tooltip title="Previous">
          <IconButton size="small" className={classes.actionButton}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </BranchPickerPrimitive.Previous>
      <Typography variant="subtitle2" color="textSecondary">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </Typography>
      <BranchPickerPrimitive.Next>
        <Tooltip title="Next">
          <IconButton size="small" className={classes.actionButton}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const AssistantActionBar = () => {
  const classes = useStyles();
  const [copied, setCopied] = useState(false);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      // autohide="never"
      autohide="not-last"
      autohideFloat="single-branch"
      className={classes.messageActions}
    >
      <ActionBarPrimitive.Copy
        onClick={() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <Tooltip title={copied ? 'Copied!' : 'Copy'}>
          <IconButton size="small" className={classes.actionButton}>
            {copied ? (
              <CheckIcon fontSize="small" />
            ) : (
              <ContentCopyIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload>
        <Tooltip title="Regenerate">
          <IconButton size="small" className={classes.actionButton}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage = () => {
  const classes = useStyles();

  return (
    <MessagePrimitive.Root>
      <div className={classes.userMessage}>
        <MessagePrimitive.Content />
      </div>
      <BranchPicker />
    </MessagePrimitive.Root>
  );
};

const AssistantMessage = () => {
  const classes = useStyles();
  const featureFlagsApi = useApi(featureFlagsApiRef);
  const verboseDebugging = featureFlagsApi.isActive(
    'ai-chat-verbose-debugging',
  );

  return (
    <MessagePrimitive.Root>
      <div className={classes.assistantMessage}>
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            ...(verboseDebugging && {
              Reasoning: Reasoning,
              ReasoningGroup: ReasoningGroup,
              ToolGroup: ToolGroup,
              tools: {
                Fallback: ToolFallback,
              },
            }),
          }}
        />
        <MessagePrimitive.Error>
          <div className={classes.errorMessage}>
            Error occured. Please try again.
          </div>
        </MessagePrimitive.Error>
      </div>
      <div className={classes.messageActionsContainer}>
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const EditComposer = () => {
  const classes = useStyles();

  return (
    <ComposerPrimitive.Root className={classes.composerForm}>
      <ComposerPrimitive.Input asChild>
        <TextField
          variant="outlined"
          size="small"
          fullWidth
          multiline
          maxRows={4}
          placeholder="Edit message..."
          className={classes.composerInput}
        />
      </ComposerPrimitive.Input>
      <ComposerPrimitive.Cancel asChild>
        <Button variant="outlined" size="small">
          Cancel
        </Button>
      </ComposerPrimitive.Cancel>
      <ComposerPrimitive.Send asChild>
        <Button variant="contained" color="primary" size="small">
          Update
        </Button>
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
};

const Composer = () => {
  const classes = useStyles();

  return (
    <div className={classes.composerContainer}>
      <ComposerPrimitive.Root className={classes.composerForm}>
        <ComposerPrimitive.Input asChild>
          <TextField
            variant="outlined"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            size="small"
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask a question..."
            className={classes.composerInput}
          />
        </ComposerPrimitive.Input>

        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send asChild>
            <Button
              variant="contained"
              color="primary"
              className={classes.sendButton}
              aria-label="Send message"
            >
              <SendIcon />
            </Button>
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>

        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel asChild>
            <Button
              variant="contained"
              className={classes.stopButton}
              aria-label="Stop generating"
            >
              <StopIcon />
            </Button>
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
      </ComposerPrimitive.Root>
    </div>
  );
};

const LoadingIndicator = () => {
  const classes = useStyles();

  return (
    <ThreadPrimitive.If running>
      <div className={classes.loadingIndicator}>
        <CircularProgress size={16} />
        <Typography variant="body2">Thinking...</Typography>
      </div>
    </ThreadPrimitive.If>
  );
};

export const Thread = () => {
  const classes = useStyles();

  return (
    <ThreadPrimitive.Root className={classes.root}>
      <ThreadPrimitive.Viewport className={classes.messagesContainer}>
        <ThreadPrimitive.Empty>
          <ThreadWelcome />
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
            EditComposer,
          }}
        />

        <LoadingIndicator />
      </ThreadPrimitive.Viewport>

      <Composer />
    </ThreadPrimitive.Root>
  );
};
