import { memo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import LinearProgress from '@material-ui/core/LinearProgress';
import type { ToolCallMessagePartComponent } from '@assistant-ui/react';

const useStyles = makeStyles(theme => ({
  root: {
    width: '100%',
    borderRadius: theme.spacing(1),
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(2),
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(1.5),
  },
  title: {
    fontWeight: 600,
    fontSize: theme.typography.body2.fontSize,
  },
  model: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
  },
  progressContainer: {
    marginBottom: theme.spacing(1.5),
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: theme.spacing(0.5),
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  stat: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: theme.spacing(1),
    borderRadius: theme.spacing(0.5),
    backgroundColor: theme.palette.background.paper,
  },
  statLabel: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.25),
  },
  statValue: {
    fontSize: theme.typography.body2.fontSize,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  unavailable: {
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
  },
}));

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString();
}

// Known context window sizes by model prefix
const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4': 200_000,
  'claude-opus-4': 200_000,
  'claude-3-7-sonnet': 200_000,
  'claude-3-5-sonnet': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-opus': 200_000,
  'claude-3-haiku': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
};

function getContextWindow(modelName: string): number | null {
  for (const [prefix, size] of Object.entries(CONTEXT_WINDOWS)) {
    if (modelName.startsWith(prefix)) return size;
  }
  return null;
}

interface UsageResult {
  available: boolean;
  message?: string;
  modelName?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  inputTokenDetails?: {
    cachedTokens?: number | null;
    cacheWriteTokens?: number | null;
    uncachedTokens?: number | null;
  };
  outputTokenDetails?: {
    textTokens?: number | null;
    reasoningTokens?: number | null;
  };
}

const ContextUsageDisplayImpl: ToolCallMessagePartComponent<
  Record<string, never>,
  UsageResult
> = ({ result }) => {
  const classes = useStyles();

  if (!result || !result.available) {
    return (
      <div className={classes.root}>
        <Typography className={classes.unavailable}>
          {result?.message ?? 'No usage data available yet.'}
        </Typography>
      </div>
    );
  }

  const contextWindow = result.modelName
    ? getContextWindow(result.modelName)
    : null;
  const usagePercent =
    contextWindow && result.inputTokens
      ? Math.min((result.inputTokens / contextWindow) * 100, 100)
      : null;

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Typography className={classes.title}>Context Usage</Typography>
        {result.modelName && (
          <Typography className={classes.model}>{result.modelName}</Typography>
        )}
      </div>

      {usagePercent !== null && contextWindow && (
        <div className={classes.progressContainer}>
          <LinearProgress
            variant="determinate"
            value={usagePercent}
            className={classes.progressBar}
          />
          <div className={classes.progressLabel}>
            <Typography variant="caption" color="textSecondary">
              {formatNumber(result.inputTokens)} / {formatNumber(contextWindow)}{' '}
              tokens
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {usagePercent.toFixed(1)}%
            </Typography>
          </div>
        </div>
      )}

      <div className={classes.grid}>
        <div className={classes.stat}>
          <Typography className={classes.statLabel}>Input tokens</Typography>
          <Typography className={classes.statValue}>
            {formatNumber(result.inputTokens)}
          </Typography>
        </div>
        <div className={classes.stat}>
          <Typography className={classes.statLabel}>Output tokens</Typography>
          <Typography className={classes.statValue}>
            {formatNumber(result.outputTokens)}
          </Typography>
        </div>
        <div className={classes.stat}>
          <Typography className={classes.statLabel}>Total tokens</Typography>
          <Typography className={classes.statValue}>
            {formatNumber(result.totalTokens)}
          </Typography>
        </div>
        {result.inputTokenDetails?.cachedTokens !== null &&
          result.inputTokenDetails?.cachedTokens !== undefined && (
            <div className={classes.stat}>
              <Typography className={classes.statLabel}>
                Cached (read)
              </Typography>
              <Typography className={classes.statValue}>
                {formatNumber(result.inputTokenDetails.cachedTokens)}
              </Typography>
            </div>
          )}
        {result.inputTokenDetails?.cacheWriteTokens !== null &&
          result.inputTokenDetails?.cacheWriteTokens !== undefined && (
            <div className={classes.stat}>
              <Typography className={classes.statLabel}>Cache write</Typography>
              <Typography className={classes.statValue}>
                {formatNumber(result.inputTokenDetails.cacheWriteTokens)}
              </Typography>
            </div>
          )}
        {result.inputTokenDetails?.uncachedTokens !== null &&
          result.inputTokenDetails?.uncachedTokens !== undefined && (
            <div className={classes.stat}>
              <Typography className={classes.statLabel}>Uncached</Typography>
              <Typography className={classes.statValue}>
                {formatNumber(result.inputTokenDetails.uncachedTokens)}
              </Typography>
            </div>
          )}
        {result.outputTokenDetails?.reasoningTokens !== null &&
          result.outputTokenDetails?.reasoningTokens !== undefined && (
            <div className={classes.stat}>
              <Typography className={classes.statLabel}>
                Reasoning tokens
              </Typography>
              <Typography className={classes.statValue}>
                {formatNumber(result.outputTokenDetails.reasoningTokens)}
              </Typography>
            </div>
          )}
        {result.outputTokenDetails?.textTokens !== null &&
          result.outputTokenDetails?.textTokens !== undefined && (
            <div className={classes.stat}>
              <Typography className={classes.statLabel}>Text tokens</Typography>
              <Typography className={classes.statValue}>
                {formatNumber(result.outputTokenDetails.textTokens)}
              </Typography>
            </div>
          )}
      </div>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ContextUsageDisplay: ToolCallMessagePartComponent = memo(
  ContextUsageDisplayImpl,
) as any;
