import { useState } from 'react';
import { Box, Button, ButtonGroup, makeStyles, Theme } from '@material-ui/core';
import { CopyTextButton } from '@backstage/core-components';
import { JsonHighlight } from '@giantswarm/backstage-plugin-ui-react';

const useStyles = makeStyles((theme: Theme) => ({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
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
}));

export interface ToolResultViewerProps {
  result: unknown;
}

/**
 * Renders a tool's JSON result with a parsed (syntax-highlighted, pretty) /
 * raw (compact) toggle and a copy button.
 *
 * ponytail: a single JSON viewer for every result shape. Shape-specific
 * renderers (k8s list → table, text → markdown) are deferred. Upgrade path:
 * detect common result envelopes and render them richly.
 */
export function ToolResultViewer({ result }: ToolResultViewerProps) {
  const classes = useStyles();
  const [mode, setMode] = useState<'parsed' | 'raw'>('parsed');

  const pretty = JSON.stringify(result, null, 2) ?? 'null';
  const raw = JSON.stringify(result) ?? 'null';
  const copyText = mode === 'parsed' ? pretty : raw;

  return (
    <Box>
      <Box className={classes.toolbar}>
        <ButtonGroup size="small">
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
      </Box>
      {mode === 'parsed' ? (
        <JsonHighlight
          customStyle={{ margin: 0, fontSize: '0.75rem', maxHeight: 480 }}
        >
          {pretty}
        </JsonHighlight>
      ) : (
        <pre className={classes.raw}>{raw}</pre>
      )}
    </Box>
  );
}
