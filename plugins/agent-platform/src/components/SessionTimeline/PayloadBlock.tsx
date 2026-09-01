import { Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { JsonHighlight } from '@giantswarm/backstage-plugin-ui-react';

import { CopyButton } from '../CodeBlock';

const useStyles = makeStyles(theme => ({
  header: {
    minWidth: 0,
    marginBottom: theme.spacing(0.5),
  },
  scroll: {
    // Tool results routinely run to hundreds of lines; unbounded, one of them
    // turns the conversation into a scroll past its own payload.
    maxHeight: 400,
    overflow: 'auto',
  },
  pre: {
    margin: 0,
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    color: theme.palette.text.primary,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    lineHeight: 1.5,
  },
}));

/**
 * Inline any string that is itself JSON (optionally fenced), recursively.
 *
 * MCP results wrap their real payload as serialized JSON inside a `content`
 * string; without this the panel shows a wall of `\"` escapes instead of the
 * structure. The wrapper's own keys stay visible.
 */
export function inlineJsonStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    let text = value;
    const fenceMatch = text.match(/^```\w*\n([\s\S]*?)\n```$/);
    if (fenceMatch) {
      text = fenceMatch[1];
    }
    try {
      const parsed = JSON.parse(text);
      // Only structures are worth inlining — a string that parses to a number
      // reads better as the string it was.
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      /* not JSON, keep as string */
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(inlineJsonStrings);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = inlineJsonStrings(v);
    }
    return out;
  }
  return value;
}

export type PayloadBlockProps = {
  /** Section label — `Arguments`, `Result`, `Proposed arguments`. */
  label: string;
  /** The payload as `expandablePayloads` formatted it. */
  content: string;
};

/**
 * One labelled payload inside an expanded activity row.
 *
 * JSON — including JSON hiding inside result strings — is highlighted;
 * anything else renders as wrapped monospace text. Both stay copyable as the
 * exact text shown.
 */
export function PayloadBlock({ label, content }: PayloadBlockProps) {
  const classes = useStyles();

  let display = content;
  let isJson = false;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      display = JSON.stringify(inlineJsonStrings(parsed), null, 2);
      isJson = true;
    }
  } catch {
    /* plain text payload */
  }

  return (
    <div>
      <Flex align="center" justify="between" gap="2" className={classes.header}>
        <Text variant="body-small" color="secondary">
          {label}
        </Text>
        <CopyButton text={display} />
      </Flex>
      <div className={classes.scroll}>
        {isJson ? (
          <JsonHighlight
            customStyle={{ margin: 0, padding: 0, background: 'none' }}
            codeTagProps={{ className: classes.code }}
          >
            {display}
          </JsonHighlight>
        ) : (
          <pre className={classes.pre}>{display}</pre>
        )}
      </div>
    </div>
  );
}
