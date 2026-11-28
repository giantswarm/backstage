import { Fragment, ReactNode, useMemo, useState } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

/** A string value longer than this, or on more lines, starts collapsed. */
const LONG_STRING = 200;
const LONG_STRING_LINES = 6;
/** What a collapsed string shows before its "Show all". */
const STRING_PREVIEW = 80;
/** A nested array or object with more text or lines than this starts collapsed. */
const LONG_CONTAINER = 1500;
const LONG_CONTAINER_LINES = 40;
/** What a collapsed array or object shows (lines) before its "Show all". */
const CONTAINER_PREVIEW_LINES = 5;

/** A piece of the laid-out Input: a key, a string value, or anything else. */
export type InputToken = {
  text: string;
  kind: 'key' | 'string' | 'other';
  /** Which string value a string token belongs to (it may span lines). */
  str?: number;
  /** A structural bracket of a non-empty array or object. */
  bracket?: '{' | '[' | '}' | ']';
  /** A line break (only in the flat form the block renders). */
  nl?: true;
};

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
  let strings = 0;
  const push = (text: string, kind: InputToken['kind']) => {
    if (token && token.kind === kind) {
      token.text += text;
      return;
    }
    token = { text, kind };
    lines[lines.length - 1].push(token);
  };
  const pushBracket = (c: '{' | '[' | '}' | ']') => {
    token = undefined;
    push(c, 'other');
    token!.bracket = c;
    token = undefined;
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
      const sid = kind === 'string' ? strings++ : undefined;
      token = undefined;
      let j = i;
      while (j <= end && j < canonical.length) {
        if (canonical[j] === '\\' && canonical[j + 1] === 'n') {
          push('\\n', kind);
          if (sid !== undefined) {
            token!.str = sid;
          }
          lines.push([]);
          token = undefined;
          j += 2;
          continue;
        }
        const step = canonical[j] === '\\' ? 2 : 1;
        push(canonical.slice(j, j + step), kind);
        if (sid !== undefined) {
          token!.str = sid;
        }
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
      pushBracket(c);
      indent++;
      newline(indent);
      continue;
    }
    if (c === '}' || c === ']') {
      indent = Math.max(0, indent - 1);
      newline(indent);
      pushBracket(c);
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

const useStyles = makeStyles(theme => ({
  block: {
    display: 'block',
    margin: 0,
    padding: theme.spacing(0.75, 1),
    border: '1px solid var(--bui-border-1, #c0c0c0)',
    borderRadius: 8,
    // The same text style as the other detail rows: no code font.
    font: 'inherit',
    color: 'inherit',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  key: { fontWeight: 600 },
  toggle: {
    all: 'unset',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: 600,
    textDecoration: 'underline',
  },
  // A string value is shaded as a whole, its continuation lines included,
  // so a multi-line value cannot pass for keys of its own.
  string: {
    background: 'var(--bui-bg-tint, rgba(127, 127, 127, 0.14))',
    borderRadius: 2,
  },
}));

/** The laid-out lines as one stream, a line break piece between lines. */
function flatten(lines: InputToken[][]): InputToken[] {
  const out: InputToken[] = [];
  lines.forEach((line, n) => {
    if (n > 0) {
      out.push({ text: '\n', kind: 'other', nl: true });
    }
    out.push(...line);
  });
  return out;
}

type Span = { start: number; end: number; length: number; lines: number };
type Container = Span & { cut: number; keep: number };

const textLength = (pieces: InputToken[], from: number, to: number) =>
  pieces.slice(from, to).reduce((n, p) => n + p.text.length, 0);

/**
 * What can collapse on its own: every string value, and every nested array
 * or object (never the outermost one), when it is long. Keys are never part
 * of a collapsed span of their own, and the outermost object always shows
 * every key.
 */
function plan(pieces: InputToken[]) {
  const strings = new Map<number, Span>();
  pieces.forEach((p, i) => {
    if (p.str === undefined) {
      return;
    }
    const span = strings.get(p.str);
    if (span) {
      span.end = i;
      span.length += p.text.length;
      span.lines += pieces[i - 1]?.nl ? 1 : 0;
    } else {
      strings.set(p.str, { start: i, end: i, length: p.text.length, lines: 0 });
    }
  });
  // A line break between two pieces of one string is inside that string.
  const inString = (i: number) =>
    pieces[i - 1]?.str !== undefined &&
    pieces[i - 1]?.str === pieces[i + 1]?.str;
  const containers = new Map<number, Container>();
  // Only the innermost large containers collapse, so the keys around a
  // large array or object stay visible; `inner` tells whether a container
  // holds a collapsed one.
  const stack: { start: number; inner: boolean }[] = [];
  pieces.forEach((p, i) => {
    if (p.bracket === '{' || p.bracket === '[') {
      stack.push({ start: i, inner: false });
    } else if (p.bracket) {
      const top = stack.pop();
      if (top === undefined || stack.length === 0) {
        return;
      }
      const { start } = top;
      const length = textLength(pieces, start + 1, i);
      let lines = 0;
      let cut = -1;
      for (let k = start + 1; k < i; k++) {
        if (pieces[k].nl && !inString(k)) {
          lines++;
          if (lines === CONTAINER_PREVIEW_LINES + 1) {
            cut = k;
          }
        }
      }
      let keep = i;
      while (keep > start && !pieces[keep].nl) {
        keep--;
      }
      if (top.inner) {
        stack[stack.length - 1].inner = true;
      } else if (
        cut > 0 &&
        (length > LONG_CONTAINER || lines > LONG_CONTAINER_LINES)
      ) {
        containers.set(start, { start, end: i, length, lines, cut, keep });
        stack[stack.length - 1].inner = true;
      }
    }
  });
  return { strings, containers };
}

function Pieces({
  pieces,
  onOpen,
}: {
  pieces: InputToken[];
  onOpen: () => void;
}) {
  const classes = useStyles();
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const { strings, containers } = useMemo(() => plan(pieces), [pieces]);
  const open = (id: string) => {
    setOpened(prev => new Set(prev).add(id));
    onOpen();
  };
  const toggle = (id: string, total: number, hidden: number, what: string) => (
    <Fragment key={`t${id}`}>
      {' '}
      <button
        type="button"
        className={classes.toggle}
        data-testid="approval-input-show-all"
        onClick={() => open(id)}
      >
        Show all {total} characters{what}
      </button>
      <Text as="span" variant="body-small" color="secondary">
        {' '}
        ({hidden} characters hidden)
      </Text>
    </Fragment>
  );
  const textOf = (from: number, to: number) =>
    pieces
      .slice(from, to)
      .map(p => p.text)
      .join('');
  // The collapsed rest stays in the page, unseen until opened, so the card
  // still holds every character the digest covers.
  const hiddenText = (key: string, text: string) => (
    <span key={key} hidden data-testid="approval-input-hidden">
      {text}
    </span>
  );
  const piece = (p: InputToken, text: string, key: string) =>
    p.kind === 'other' ? (
      <Fragment key={key}>{text}</Fragment>
    ) : (
      <span
        key={key}
        className={p.kind === 'key' ? classes.key : classes.string}
      >
        {text}
      </span>
    );
  const render = (from: number, to: number): ReactNode[] => {
    const out: ReactNode[] = [];
    let i = from;
    while (i < to) {
      const p = pieces[i];
      const str = p.str === undefined ? undefined : strings.get(p.str);
      if (
        str &&
        str.start === i &&
        str.end < to &&
        (str.length > LONG_STRING || str.lines > LONG_STRING_LINES) &&
        !opened.has(`s${p.str}`)
      ) {
        let left = STRING_PREVIEW;
        for (let k = str.start; k <= str.end && left > 0; k++) {
          const t = pieces[k].text.slice(0, left);
          out.push(piece(pieces[k], t, `p${k}`));
          left -= pieces[k].nl ? 1 : t.length;
        }
        out.push(
          hiddenText(
            `h${i}`,
            textOf(str.start, str.end + 1).slice(STRING_PREVIEW),
          ),
          <Fragment key={`e${i}`}>…</Fragment>,
          toggle(`s${p.str}`, str.length, str.length - STRING_PREVIEW, ''),
        );
        i = str.end + 1;
        continue;
      }
      const box = p.bracket ? containers.get(i) : undefined;
      if (box && box.end < to && !opened.has(`c${i}`)) {
        out.push(...render(i, box.cut));
        out.push(
          hiddenText(`h${i}`, textOf(box.cut, box.keep)),
          <Fragment key={`e${i}`}>…</Fragment>,
          toggle(
            `c${i}`,
            box.length,
            box.length - textLength(pieces, i + 1, box.cut),
            '',
          ),
        );
        i = box.keep;
        continue;
      }
      out.push(piece(p, p.text, `p${i}`));
      i++;
    }
    return out;
  };
  return <>{render(0, pieces.length)}</>;
}

/**
 * The tool's input as one block: muster's canonical arguments, pretty
 * printed. Every key stays on the card; only a long string value, or a very
 * large nested array or object, is collapsed, on its own, with its own
 * "Show all". Nothing is cut: opening a value is the person's choice, and
 * Approve does not wait for it.
 */
export function InputBlock({
  canonical,
  onOpen,
}: {
  canonical: string;
  onOpen: () => void;
}) {
  const classes = useStyles();
  const pieces = useMemo(() => flatten(layoutInput(canonical)), [canonical]);
  if (isEmptyInput(canonical)) {
    return (
      <Text as="p" variant="body-small" data-testid="approval-input">
        <strong>Input:</strong> none
      </Text>
    );
  }
  return (
    <div data-testid="approval-input">
      <Text as="p" variant="body-small" weight="bold">
        Input:
      </Text>
      <pre className={classes.block}>
        <Pieces pieces={pieces} onOpen={onOpen} />
      </pre>
    </div>
  );
}
