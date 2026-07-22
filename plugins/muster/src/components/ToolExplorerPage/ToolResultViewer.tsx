import { useMemo, useState } from 'react';
import type { Key } from 'react-aria-components';
import {
  Box,
  ButtonIcon,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import GetAppIcon from '@material-ui/icons/GetApp';
import ReplayIcon from '@material-ui/icons/Replay';
import UnfoldLessIcon from '@material-ui/icons/UnfoldLess';
import UnfoldMoreIcon from '@material-ui/icons/UnfoldMore';
import { CopyTextButton } from '@backstage/core-components';
import { JsonHighlight } from '@giantswarm/backstage-plugin-ui-react';
import { detectTable } from '../../lib/resultShape';

type ViewMode = 'parsed' | 'raw' | 'table';

/** One table row: a stable id plus the raw record `detectTable` produced. */
type ResultRow = { id: string; values: Record<string, unknown> };

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

  const columnConfig = useMemo<ColumnConfig<ResultRow>[]>(
    () =>
      (table?.columns ?? []).map(col => ({
        id: col,
        label: col,
        cell: row => <CellText title={cellText(row.values[col])} />,
      })),
    [table],
  );
  const rows = useMemo<ResultRow[]>(
    () => (table?.rows ?? []).map((values, i) => ({ id: String(i), values })),
    [table],
  );

  const download = () => {
    const blob = new Blob([pretty], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tool-result.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onModeChange = (keys: Set<Key>) => {
    const next = [...keys][0];
    if (next) {
      setMode(String(next) as ViewMode);
    }
  };

  return (
    <Box>
      <Flex
        align="center"
        justify="between"
        gap="2"
        style={{ flexWrap: 'wrap' }}
      >
        <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[mode]}
            onSelectionChange={onModeChange}
          >
            {table ? <ToggleButton id="table">Table</ToggleButton> : <></>}
            <ToggleButton id="parsed">Parsed</ToggleButton>
            <ToggleButton id="raw">Raw</ToggleButton>
          </ToggleButtonGroup>
          <CopyTextButton text={copyText} tooltipText="Copied result" />
          <TooltipTrigger>
            <ButtonIcon
              variant="tertiary"
              size="small"
              aria-label="Download as JSON"
              icon={<GetAppIcon fontSize="small" />}
              onClick={download}
            />
            <Tooltip>Download as JSON</Tooltip>
          </TooltipTrigger>
          {mode === 'parsed' && (
            <TooltipTrigger>
              <ButtonIcon
                variant="tertiary"
                size="small"
                aria-label={collapsed ? 'Expand' : 'Collapse'}
                icon={
                  collapsed ? (
                    <UnfoldMoreIcon fontSize="small" />
                  ) : (
                    <UnfoldLessIcon fontSize="small" />
                  )
                }
                onClick={() => setCollapsed(c => !c)}
              />
              <Tooltip>{collapsed ? 'Expand' : 'Collapse'}</Tooltip>
            </TooltipTrigger>
          )}
          {onRerun && (
            <TooltipTrigger>
              <ButtonIcon
                variant="tertiary"
                size="small"
                aria-label="Run again with the same arguments"
                icon={<ReplayIcon fontSize="small" />}
                isDisabled={rerunDisabled}
                onClick={onRerun}
              />
              <Tooltip>Run again with the same arguments</Tooltip>
            </TooltipTrigger>
          )}
        </Flex>
        <Flex align="center" gap="3">
          {durationMs !== undefined && (
            <Text
              variant="body-small"
              color="secondary"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {durationMs} ms
            </Text>
          )}
          <Text
            variant="body-small"
            color="secondary"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatBytes(sizeBytes)}
          </Text>
          <Text
            variant="body-small"
            color="secondary"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            ~{approxTokens.toLocaleString()} tok
          </Text>
        </Flex>
      </Flex>

      <Box mt="2">
        {mode === 'table' && table && (
          <Box
            style={{
              maxHeight: 480,
              overflow: 'auto',
              border: '1px solid var(--bui-border-1)',
              borderRadius: 'var(--bui-radius-2)',
            }}
          >
            <Table<ResultRow>
              columnConfig={columnConfig}
              data={rows}
              pagination={{ type: 'none' }}
            />
          </Box>
        )}

        {mode === 'parsed' &&
          (collapsed ? (
            <Text variant="body-small" color="secondary">
              Result collapsed ({table ? `${table.rows.length} rows, ` : ''}
              {formatBytes(sizeBytes)}). Use the expand button to show it.
            </Text>
          ) : (
            <JsonHighlight
              customStyle={{ margin: 0, fontSize: '0.75rem', maxHeight: 480 }}
            >
              {pretty}
            </JsonHighlight>
          ))}

        {mode === 'raw' && (
          <Box
            as="pre"
            style={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 480,
              overflow: 'auto',
            }}
          >
            {raw}
          </Box>
        )}
      </Box>
    </Box>
  );
}
