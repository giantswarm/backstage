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
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
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

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

// Known context window sizes by model prefix
// More specific prefixes must come before less specific ones (startsWith matching)
const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4-6': 1_000_000,
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-4-5': 200_000,
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

// Per-token pricing in USD (price per million tokens)
// Source: https://platform.claude.com/docs/en/about-claude/pricing
interface TokenPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const TOKEN_PRICING: Record<string, TokenPricing> = {
  'claude-opus-4-6': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-1': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-opus-4': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-sonnet-4-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-sonnet-4': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-3-7-sonnet': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-3-5-sonnet': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-3-5-haiku': { inputPerMTok: 0.8, outputPerMTok: 4 },
  'claude-3-opus': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-3-haiku': { inputPerMTok: 0.25, outputPerMTok: 1.25 },
};

function getTokenPricing(modelName: string): TokenPricing | null {
  for (const [prefix, pricing] of Object.entries(TOKEN_PRICING)) {
    if (modelName.startsWith(prefix)) return pricing;
  }
  return null;
}

function estimateCost(result: UsageResult, pricing: TokenPricing): number {
  const inputTokens = result.inputTokens ?? 0;
  const outputTokens = result.outputTokens ?? 0;

  return (
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}

interface UsageResult {
  available: boolean;
  message?: string;
  modelName?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputTokenDetails?: {
    cachedTokens?: number | null;
    cacheWriteTokens?: number | null;
  };
  outputTokenDetails?: {
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

  const pricing = result.modelName ? getTokenPricing(result.modelName) : null;
  const cost = pricing ? estimateCost(result, pricing) : null;

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
        {result.inputTokenDetails?.cacheWriteTokens != null &&
          result.inputTokenDetails.cacheWriteTokens > 0 && (
            <div className={classes.stat}>
              <Typography className={classes.statLabel}>
                Cached (write)
              </Typography>
              <Typography className={classes.statValue}>
                {formatNumber(result.inputTokenDetails.cacheWriteTokens)}
              </Typography>
            </div>
          )}
        {result.inputTokenDetails?.cachedTokens != null &&
          result.inputTokenDetails.cachedTokens > 0 && (
            <div className={classes.stat}>
              <Typography className={classes.statLabel}>
                Cached (read)
              </Typography>
              <Typography className={classes.statValue}>
                {formatNumber(result.inputTokenDetails.cachedTokens)}
              </Typography>
            </div>
          )}
        {result.outputTokenDetails?.reasoningTokens != null &&
          result.outputTokenDetails.reasoningTokens > 0 && (
            <div className={classes.stat}>
              <Typography className={classes.statLabel}>
                Reasoning tokens
              </Typography>
              <Typography className={classes.statValue}>
                {formatNumber(result.outputTokenDetails.reasoningTokens)}
              </Typography>
            </div>
          )}
        {cost !== null && (
          <div className={classes.stat}>
            <Typography className={classes.statLabel}>
              Estimated cost
            </Typography>
            <Typography className={classes.statValue}>
              {formatCost(cost)}
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
