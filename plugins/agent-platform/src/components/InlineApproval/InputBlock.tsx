import { Fragment, useState } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

/** An Input longer than this, or on more lines, starts collapsed. */
const LONG_INPUT = 600;
const LONG_INPUT_LINES = 20;
/** What a collapsed Input shows before "Show all". */
const PREVIEW_CHARS = 300;
const PREVIEW_LINES = 8;

/** A piece of the laid-out Input: a key, a string value, or anything else. */
export type InputToken = { text: string; kind: 'key' | 'string' | 'other' };

/**
 * Lays out muster's canonical arguments (`canonicalArguments`, the exact
 * text the arguments hash covers, invisible characters already marked
 * `⟨U+XXXX⟩` by muster) as indented lines. Only whitespace is added: every
 * character of the canonical text stays, escapes included, in order (no
 * parse, so no reordering of keys and no rounding of numbers). A string's
 * `\n` escape stays visible and is followed by a real line break, so a
 * multi-line value reads as lines but cannot pass for further keys: its
 * continuation is part of the same string token, and its quotes stay
 * escaped. Text that is not JSON comes out as it is.
 */
export function layoutInput(canonical: string): InputToken[][] {
  const lines: InputToken[][] = [[]];
  let indent = 0;
  let token: InputToken | undefined;
  const push = (text: string, kind: InputToken['kind']) => {
    if (token && token.kind === kind) {
      token.text += text;
      return;
    }
    token = { text, kind };
    lines[lines.length - 1].push(token);
  };
  const newline = (depth: number) => {
    token = undefined;
    lines.push([]);
    if (depth > 0) {
      push('  '.repeat(depth), 'other');
      token = undefined;
    }
  };
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical[i];
    if (c === '"') {
      // A string: a key when a colon follows it.
      let end = i + 1;
      while (end < canonical.length && canonical[end] !== '"') {
        end += canonical[end] === '\\' ? 2 : 1;
      }
      const kind = canonical[end + 1] === ':' ? 'key' : 'string';
      token = undefined;
      let j = i;
      while (j <= end && j < canonical.length) {
        if (canonical[j] === '\\' && canonical[j + 1] === 'n') {
          push('\\n', kind);
          lines.push([]);
          token = undefined;
          j += 2;
          continue;
        }
        const step = canonical[j] === '\\' ? 2 : 1;
        push(canonical.slice(j, j + step), kind);
        j += step;
      }
      token = undefined;
      i = end;
      continue;
    }
    if (
      (c === '{' || c === '[') &&
      canonical[i + 1] === (c === '{' ? '}' : ']')
    ) {
      push(c + canonical[i + 1], 'other');
      i++;
      continue;
    }
    if (c === '{' || c === '[') {
      push(c, 'other');
      indent++;
      newline(indent);
      continue;
    }
    if (c === '}' || c === ']') {
      indent = Math.max(0, indent - 1);
      newline(indent);
      push(c, 'other');
      continue;
    }
    if (c === ',') {
      push(c, 'other');
      newline(indent);
      continue;
    }
    if (c === ':') {
      push(': ', 'other');
      continue;
    }
    push(c, 'other');
  }
  return lines;
}

/** Whether muster's canonical arguments carry no argument. */
export function isEmptyInput(canonical: string): boolean {
  const trimmed = canonical.trim();
  return trimmed === '' || trimmed === '{}' || trimmed === 'null';
}

/** The text of laid-out lines, as the block shows it. */
function linesText(lines: InputToken[][]): string {
  return lines.map(line => line.map(t => t.text).join('')).join('\n');
}

/** The first lines of a long Input, cut at PREVIEW_CHARS. */
function preview(lines: InputToken[][]): InputToken[][] {
  const out: InputToken[][] = [];
  let left = PREVIEW_CHARS;
  for (const line of lines.slice(0, PREVIEW_LINES)) {
    const kept: InputToken[] = [];
    for (const t of line) {
      if (left <= 0) {
        break;
      }
      kept.push({ ...t, text: t.text.slice(0, left) });
      left -= Math.min(left, t.text.length);
    }
    out.push(kept);
    left -= 1; // the line break
    if (left <= 0) {
      break;
    }
  }
  return out;
}

const useStyles = makeStyles(theme => ({
  block: {
    display: 'block',
    margin: 0,
    padding: theme.spacing(0.75, 1),
    border: '1px solid var(--bui-border-1, #c0c0c0)',
    borderRadius: 8,
    fontFamily: 'var(--bui-font-monospace, ui-monospace, monospace)',
    fontSize: 'var(--bui-font-size-2, 12px)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  key: { fontWeight: 600 },
  // A string value is shaded as a whole, its continuation lines included,
  // so a multi-line value cannot pass for keys of its own.
  string: {
    background: 'var(--bui-bg-tint, rgba(127, 127, 127, 0.14))',
    borderRadius: 2,
  },
}));

function Lines({ lines }: { lines: InputToken[][] }) {
  const classes = useStyles();
  return (
    <>
      {lines.map((line, n) => (
        <Fragment key={n}>
          {n > 0 && '\n'}
          {line.map((t, k) =>
            t.kind === 'other' ? (
              <Fragment key={k}>{t.text}</Fragment>
            ) : (
              <span
                key={k}
                className={t.kind === 'key' ? classes.key : classes.string}
              >
                {t.text}
              </span>
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * The tool's input as one block: muster's canonical arguments, pretty
 * printed. A long one is collapsed, never cut: "Show all" opens the rest,
 * and opening it is the person's choice; Approve does not wait for it.
 */
export function InputBlock({
  canonical,
  onOpen,
}: {
  canonical: string;
  onOpen: () => void;
}) {
  const classes = useStyles();
  const [open, setOpen] = useState(false);
  if (isEmptyInput(canonical)) {
    return (
      <Text as="p" variant="body-small" data-testid="approval-input">
        <strong>Input:</strong> none
      </Text>
    );
  }
  const lines = layoutInput(canonical);
  const total = linesText(lines).length;
  const label = (
    <Text as="p" variant="body-small" weight="bold">
      Input:
    </Text>
  );
  if (total <= LONG_INPUT && lines.length <= LONG_INPUT_LINES) {
    return (
      <div data-testid="approval-input">
        {label}
        <pre className={classes.block}>
          <Lines lines={lines} />
        </pre>
      </div>
    );
  }
  const shown = preview(lines);
  const hidden = total - linesText(shown).length;
  return (
    <div data-testid="approval-input">
      {label}
      <details
        data-testid="approval-collapsed-input"
        onToggle={event => {
          const isOpen = (event.currentTarget as HTMLDetailsElement).open;
          setOpen(isOpen);
          if (isOpen) {
            onOpen();
          }
        }}
      >
        <summary>
          <Text as="span" variant="body-small" weight="bold">
            {open ? 'Showing all' : 'Show all'} {total} characters
          </Text>
          {!open && (
            <Text as="span" variant="body-small" color="secondary">
              {' '}
              ({hidden} characters hidden)
            </Text>
          )}
        </summary>
        <pre className={classes.block}>
          <Lines lines={lines} />
        </pre>
      </details>
      {!open && (
        <pre className={classes.block} data-testid="approval-input-preview">
          <Lines lines={shown} />…
        </pre>
      )}
    </div>
  );
}
