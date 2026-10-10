import { useMemo, useState } from 'react';
import type { Key } from 'react-aria-components';
import {
  Box,
  ButtonIcon,
  CellText,
  ColumnConfig,
  Flex,
  SearchField,
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
import {
  ShowMore,
  YamlEditorFormField,
} from '@giantswarm/backstage-plugin-ui-react';
import { detectTable } from '../../lib/resultShape';

type ViewMode = 'parsed' | 'raw' | 'table';

// Fills the viewport below the toolbar once the result is scrolled into view,
// with a usable minimum on short windows.
const RESULT_MAX_HEIGHT = 'max(240px, calc(100vh - 200px))';

/**
 * How many table rows render before *Show N more rows*, and the row count above
 * which the table gets a filter field. A k8s list result can be thousands of
 * rows; past a screenful, finding one is a filter, not a scroll.
 */
export const RESULT_TABLE_ROWS = 50;

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
 * Renders a tool's JSON result: a parsed (pretty-printed, foldable) view in the
 * read-only editor, a compact table when the result is a list of like-shaped
 * objects, and a raw (compact) view. Shows the call duration and result
 * size, and offers copy, download, and one-click re-run. The table shows its
 * first {@link RESULT_TABLE_ROWS} rows (more a page at a time) and, only when
 * the result is longer than that, a filter over every cell's text.
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
  const [query, setQuery] = useState('');

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
      (table?.columns ?? []).map((col, index) => ({
        id: col,
        label: col,
        // The leading column (`name` when the rows have one) names the row.
        isRowHeader: index === 0,
        cell: row => <CellText title={cellText(row.values[col])} />,
      })),
    [table],
  );
  const rows = useMemo<ResultRow[]>(
    () => (table?.rows ?? []).map((values, i) => ({ id: String(i), values })),
    [table],
  );
  const hasFilter = rows.length > RESULT_TABLE_ROWS;
  const needle = hasFilter ? query.trim().toLowerCase() : '';
  // Client-side, case-insensitive, over the text each visible cell shows.
  const filteredRows = useMemo(
    () =>
      needle
        ? rows.filter(row =>
            (table?.columns ?? []).some(col =>
              cellText(row.values[col]).toLowerCase().includes(needle),
            ),
          )
        : rows,
    [rows, table, needle],
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
          <Flex direction="column" gap="2">
            {hasFilter && (
              <SearchField
                aria-label="Filter rows"
                placeholder="Filter rows"
                value={query}
                onChange={setQuery}
                style={{ maxWidth: 480 }}
              />
            )}
            {filteredRows.length === 0 ? (
              <Text as="p" variant="body-small" color="secondary">
                No row matches “{query}”.
              </Text>
            ) : (
              // Keyed on the filter so a new search starts at the first page.
              <ShowMore
                key={needle}
                items={filteredRows}
                initial={RESULT_TABLE_ROWS}
                noun="row"
              >
                {visible => (
                  <Box
                    style={{
                      maxHeight: RESULT_MAX_HEIGHT,
                      overflow: 'auto',
                      border: '1px solid var(--bui-border-1)',
                      borderRadius: 'var(--bui-radius-2)',
                    }}
                  >
                    <Table<ResultRow>
                      columnConfig={columnConfig}
                      data={visible}
                      pagination={{ type: 'none' }}
                    />
                  </Box>
                )}
              </ShowMore>
            )}
          </Flex>
        )}

        {mode === 'parsed' &&
          (collapsed ? (
            <Text variant="body-small" color="secondary">
              Result collapsed ({table ? `${table.rows.length} rows, ` : ''}
              {formatBytes(sizeBytes)}). Use the expand button to show it.
            </Text>
          ) : (
            <YamlEditorFormField
              value={pretty}
              language="json"
              readOnly
              maxHeight={RESULT_MAX_HEIGHT}
            />
          ))}

        {/* A plain <pre>: the compact JSON is one line, which CodeMirror
            renders and highlights in full. */}
        {mode === 'raw' && (
          <Box
            as="pre"
            style={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: RESULT_MAX_HEIGHT,
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
