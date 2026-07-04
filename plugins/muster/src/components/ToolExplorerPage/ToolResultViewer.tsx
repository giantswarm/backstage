import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import GetAppIcon from '@material-ui/icons/GetApp';
import ReplayIcon from '@material-ui/icons/Replay';
import UnfoldLessIcon from '@material-ui/icons/UnfoldLess';
import UnfoldMoreIcon from '@material-ui/icons/UnfoldMore';
import { CopyTextButton } from '@backstage/core-components';
import { JsonHighlight } from '@giantswarm/backstage-plugin-ui-react';
import { detectTable } from '../../lib/resultShape';

const useStyles = makeStyles((theme: Theme) => ({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    flexWrap: 'wrap',
  },
  meta: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    color: theme.palette.text.secondary,
  },
  metaValue: {
    fontVariantNumeric: 'tabular-nums',
  },
  raw: {
    margin: 0,
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 480,
    overflow: 'auto',
  },
  cell: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    maxWidth: 280,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerCell: {
    whiteSpace: 'nowrap',
  },
  tableWrap: {
    maxHeight: 480,
    overflow: 'auto',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
}));

type ViewMode = 'parsed' | 'raw' | 'table';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export interface ToolResultViewerProps {
  result: unknown;
  /** Wall-clock duration of the call, surfaced next to the result. */
  durationMs?: number;
  /** Re-run the last call with the same arguments. */
  onRerun?: () => void;
  rerunDisabled?: boolean;
}

/**
 * Renders a tool's JSON result: a parsed (syntax-highlighted, collapsible) view,
 * a compact table when the result is a list of like-shaped objects, and a raw
 * (compact) view. Shows the call duration and result size, and offers copy,
 * download, and one-click re-run.
 */
export function ToolResultViewer({
  result,
  durationMs,
  onRerun,
  rerunDisabled,
}: ToolResultViewerProps) {
  const classes = useStyles();
  const table = useMemo(() => detectTable(result), [result]);
  const [mode, setMode] = useState<ViewMode>(table ? 'table' : 'parsed');
  const [collapsed, setCollapsed] = useState(false);

  const pretty = useMemo(
    () => JSON.stringify(result, null, 2) ?? 'null',
    [result],
  );
  const raw = useMemo(() => JSON.stringify(result) ?? 'null', [result]);
  const sizeBytes = raw.length;
  // Rough token estimate (~4 chars/token); enough to flag a large result.
  const approxTokens = Math.max(1, Math.ceil(sizeBytes / 4));
  const copyText = mode === 'raw' ? raw : pretty;

  const download = () => {
    const blob = new Blob([pretty], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tool-result.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Box className={classes.toolbar}>
        <ButtonGroup size="small">
          {table && (
            <Button
              variant={mode === 'table' ? 'contained' : 'outlined'}
              onClick={() => setMode('table')}
            >
              Table
            </Button>
          )}
          <Button
            variant={mode === 'parsed' ? 'contained' : 'outlined'}
            onClick={() => setMode('parsed')}
          >
            Parsed
          </Button>
          <Button
            variant={mode === 'raw' ? 'contained' : 'outlined'}
            onClick={() => setMode('raw')}
          >
            Raw
          </Button>
        </ButtonGroup>
        <CopyTextButton text={copyText} tooltipText="Copied result" />
        <Tooltip title="Download as JSON">
          <IconButton size="small" onClick={download}>
            <GetAppIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {mode === 'parsed' && (
          <Tooltip title={collapsed ? 'Expand' : 'Collapse'}>
            <IconButton size="small" onClick={() => setCollapsed(c => !c)}>
              {collapsed ? (
                <UnfoldMoreIcon fontSize="small" />
              ) : (
                <UnfoldLessIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}
        {onRerun && (
          <Tooltip title="Run again with the same arguments">
            <span>
              <IconButton
                size="small"
                onClick={onRerun}
                disabled={rerunDisabled}
              >
                <ReplayIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Box className={classes.meta}>
          {durationMs !== undefined && (
            <Typography variant="caption" className={classes.metaValue}>
              {durationMs} ms
            </Typography>
          )}
          <Typography variant="caption" className={classes.metaValue}>
            {formatBytes(sizeBytes)}
          </Typography>
          <Typography variant="caption" className={classes.metaValue}>
            ~{approxTokens.toLocaleString()} tok
          </Typography>
        </Box>
      </Box>

      {mode === 'table' && table && (
        <Box className={classes.tableWrap}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {table.columns.map(col => (
                  <TableCell key={col} className={classes.headerCell}>
                    {col}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {table.rows.map((row, i) => (
                <TableRow key={i}>
                  {table.columns.map(col => (
                    <TableCell key={col} className={classes.cell}>
                      <Tooltip title={cellText(row[col])}>
                        <span>{cellText(row[col])}</span>
                      </Tooltip>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {mode === 'parsed' &&
        (collapsed ? (
          <Typography variant="caption" color="textSecondary">
            Result collapsed ({table ? `${table.rows.length} rows, ` : ''}
            {formatBytes(sizeBytes)}). Use the expand button to show it.
          </Typography>
        ) : (
          <JsonHighlight
            customStyle={{ margin: 0, fontSize: '0.75rem', maxHeight: 480 }}
          >
            {pretty}
          </JsonHighlight>
        ))}

      {mode === 'raw' && <pre className={classes.raw}>{raw}</pre>}
    </Box>
  );
}
