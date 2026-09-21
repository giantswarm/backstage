import { count } from './comparison';

/**
 * A line diff of two YAML texts, computed on the page: the file on record
 * against the file the definition renders. A line is compared with its
 * parents by indentation, so `enabled: true` under one key is never the
 * same line as under another; the lines unique to both sides anchor the
 * alignment (a patience diff), so a moved or rewritten block reads as one
 * removal then one addition; the stretches between the anchors take the
 * longest common subsequence. Small enough to need no library: the files
 * are configuration of a few hundred lines.
 */

export interface DiffLine {
  kind: 'context' | 'removed' | 'added';
  text: string;
  /** 1-based line in the text on record; absent on an added line. */
  currentLine?: number;
  /** 1-based line in the rendered text; absent on a removed line. */
  line?: number;
}

/**
 * A run of lines of the diff: shown, or folded behind an expander where
 * nothing changed or only comments did.
 */
export interface DiffRun {
  fold?: 'unchanged' | 'comments';
  lines: DiffLine[];
}

/** The lines of a text; a trailing newline ends the last line rather than starting an empty one. */
export function splitLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return text === '' ? [] : lines;
}

/** The leading spaces of a line; -1 where a tab indents it. */
function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === ' ') {
    n++;
  }
  return line[n] === '\t' ? -1 : n;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The unit of a text's indentation: the greatest common divisor of its
 * lines' leading spaces (2 for the render, 4 for a file SOPS wrote); 0
 * where no line is indented or a tab indents one.
 */
export function indentUnit(text: string): number {
  let unit = 0;
  for (const line of splitLines(text)) {
    if (line.trim() === '') {
      continue;
    }
    const indent = indentOf(line);
    if (indent < 0) {
      return 0;
    }
    unit = gcd(unit, indent);
  }
  return unit;
}

/** The text with every line's indentation scaled from `from` to `to` spaces a level; the lines stay where they are. */
export function reindent(text: string, from: number, to: number): string {
  return text
    .split('\n')
    .map(line => {
      const indent = indentOf(line);
      if (indent <= 0 || line.trim() === '') {
        return line;
      }
      return ' '.repeat((indent / from) * to) + line.slice(indent);
    })
    .join('\n');
}

/** Which side the diff reindented, and how. */
export interface Reindented {
  side: 'record' | 'render';
  from: number;
  to: number;
}

/**
 * Both texts at one indentation: where one side indents deeper by a whole
 * multiple (SOPS's four spaces against the render's two), it is scaled to
 * the other's unit, so only the lines whose content differs differ. Neither
 * side is touched where a unit is not a plausible indentation (1, or tabs)
 * or the units do not divide.
 */
export function alignIndentation(
  current: string,
  content: string,
): { current: string; content: string; reindented?: Reindented } {
  const a = indentUnit(current);
  const b = indentUnit(content);
  if (a < 2 || b < 2 || a === b || Math.max(a, b) % Math.min(a, b) !== 0) {
    return { current, content };
  }
  if (a > b) {
    return {
      current: reindent(current, a, b),
      content,
      reindented: { side: 'record', from: a, to: b },
    };
  }
  return {
    current,
    content: reindent(content, b, a),
    reindented: { side: 'render', from: b, to: a },
  };
}

/** A mapping key at the start of a line's body: `key:` or `key: value`. */
const KEY = /^([^\s#][^:]*?):(?:\s|$)/;

/**
 * Each line keyed by its parents -- the mapping keys above it at shallower
 * indentation, a sequence entry's `- ` counting as two columns -- and
 * itself, so a leaf reads as the same line only under the same key.
 * Comments and blank lines take the parents of their indentation without
 * moving anyone else's.
 */
function keyedLines(lines: string[]): string[] {
  const stack: { indent: number; key: string }[] = [];
  return lines.map(line => {
    let indent = Math.max(indentOf(line), 0);
    let body = line.slice(indent);
    const prose = body === '' || body.startsWith('#');
    while (body.startsWith('- ')) {
      indent += 2;
      body = body.slice(2);
    }
    if (!prose) {
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
    }
    const parents = prose ? stack.filter(s => s.indent < indent) : stack;
    const key = parents.map(s => s.key).join('/');
    const match = prose ? null : KEY.exec(body);
    if (match) {
      stack.push({ indent, key: match[1] });
    }
    return `${key}\u0000${line}`;
  });
}

/** The longest subsequence of the pairs, ordered by their first, whose seconds increase: patience sorting. */
function longestIncreasing(pairs: [number, number][]): [number, number][] {
  const tails: number[] = [];
  const prev = new Array<number>(pairs.length).fill(-1);
  for (let k = 0; k < pairs.length; k++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][1] < pairs[k][1]) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    prev[k] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = k;
  }
  const chain: [number, number][] = [];
  for (
    let k = tails.length > 0 ? tails[tails.length - 1] : -1;
    k >= 0;
    k = prev[k]
  ) {
    chain.push(pairs[k]);
  }
  return chain.reverse();
}

/** The cells of the longest-common-subsequence table the page fills; a wider stretch is shown removed then added. */
const LCS_CELLS = 1 << 22;

class Differ {
  private readonly ka: string[];
  private readonly kb: string[];

  constructor(
    private readonly a: string[],
    private readonly b: string[],
  ) {
    this.ka = keyedLines(a);
    this.kb = keyedLines(b);
  }

  private same(i: number, j: number): boolean {
    return this.ka[i] === this.kb[j];
  }

  private context(i: number, j: number): DiffLine {
    return {
      kind: 'context',
      text: this.a[i],
      currentLine: i + 1,
      line: j + 1,
    };
  }

  private removed(i: number): DiffLine {
    return { kind: 'removed', text: this.a[i], currentLine: i + 1 };
  }

  private added(j: number): DiffLine {
    return { kind: 'added', text: this.b[j], line: j + 1 };
  }

  /** The common head and tail as context, the lines unique to both sides as anchors, the rest between them recursively. */
  patience(
    aLo: number,
    aHi: number,
    bLo: number,
    bHi: number,
    out: DiffLine[],
  ): void {
    let [i, j, n, m] = [aLo, bLo, aHi, bHi];
    while (i < n && j < m && this.same(i, j)) {
      out.push(this.context(i, j));
      i++;
      j++;
    }
    const tail: DiffLine[] = [];
    while (i < n && j < m && this.same(n - 1, m - 1)) {
      n--;
      m--;
      tail.push(this.context(n, m));
    }
    if (i < n || j < m) {
      const anchors = this.anchors(i, n, j, m);
      if (anchors.length === 0) {
        this.lcs(i, n, j, m, out);
      } else {
        for (const [x, y] of anchors) {
          this.patience(i, x, j, y, out);
          out.push(this.context(x, y));
          i = x + 1;
          j = y + 1;
        }
        this.patience(i, n, j, m, out);
      }
    }
    out.push(...tail.reverse());
  }

  /** The lines that occur once on each side of the range, paired, in the longest chain that keeps both orders. */
  private anchors(
    aLo: number,
    aHi: number,
    bLo: number,
    bHi: number,
  ): [number, number][] {
    const inA = new Map<string, number>();
    for (let i = aLo; i < aHi; i++) {
      inA.set(this.ka[i], inA.has(this.ka[i]) ? -1 : i);
    }
    const inB = new Map<string, number>();
    for (let j = bLo; j < bHi; j++) {
      inB.set(this.kb[j], inB.has(this.kb[j]) ? -1 : j);
    }
    const pairs: [number, number][] = [];
    for (let i = aLo; i < aHi; i++) {
      const j = inB.get(this.ka[i]);
      if (inA.get(this.ka[i]) === i && j !== undefined && j >= 0) {
        pairs.push([i, j]);
      }
    }
    return longestIncreasing(pairs);
  }

  /** The longest common subsequence of the range as context, the rest removed then added; too wide a range is removed then added whole. */
  private lcs(
    aLo: number,
    aHi: number,
    bLo: number,
    bHi: number,
    out: DiffLine[],
  ): void {
    const n = aHi - aLo;
    const m = bHi - bLo;
    const width = m + 1;
    if ((n + 1) * width > LCS_CELLS) {
      for (let i = aLo; i < aHi; i++) {
        out.push(this.removed(i));
      }
      for (let j = bLo; j < bHi; j++) {
        out.push(this.added(j));
      }
      return;
    }
    // table[i * width + j]: the longest common subsequence of a[aLo + i:] and b[bLo + j:].
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] = this.same(aLo + i, bLo + j)
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && this.same(aLo + i, bLo + j)) {
        out.push(this.context(aLo + i, bLo + j));
        i++;
        j++;
      } else if (
        i < n &&
        (j >= m || table[(i + 1) * width + j] >= table[i * width + j + 1])
      ) {
        out.push(this.removed(aLo + i));
        i++;
      } else {
        out.push(this.added(bLo + j));
        j++;
      }
    }
  }
}

/**
 * The line diff of `current` (on record) against `content` (rendered):
 * the lines common to both, under the same parents, are the context; the
 * rest is removed from the record or added by the render, removals first.
 */
export function diffLines(current: string, content: string): DiffLine[] {
  const a = splitLines(current);
  const b = splitLines(content);
  const out: DiffLine[] = [];
  new Differ(a, b).patience(0, a.length, 0, b.length, out);
  return out;
}

/** The unchanged lines kept on each side of a change. */
export const CONTEXT = 2;

/** A comment or a blank line: nothing a value lives on. */
const PROSE = /^\s*(#|$)/;

/**
 * The diff in runs: changed lines with `CONTEXT` unchanged lines around
 * them, the longer unchanged stretches folded, and a change of two or more
 * lines that are all comments or blank folded as well, so the hand-written
 * comments of a record do not drown the values. A stretch of one or two
 * unchanged lines is not worth an expander and stays shown.
 */
export function foldContext(lines: DiffLine[]): DiffRun[] {
  const runs: DiffRun[] = [];
  const push = (fold: DiffRun['fold'], part: DiffLine[]) => {
    if (part.length === 0) {
      return;
    }
    const last = runs[runs.length - 1];
    if (last && last.fold === fold && fold !== 'comments') {
      last.lines.push(...part);
    } else {
      runs.push({ fold, lines: [...part] });
    }
  };
  let start = 0;
  while (start < lines.length) {
    let end = start;
    while (end < lines.length && lines[end].kind === lines[start].kind) {
      end++;
    }
    const run = lines.slice(start, end);
    if (run[0].kind !== 'context') {
      const comments = run.length >= 2 && run.every(l => PROSE.test(l.text));
      push(comments ? 'comments' : undefined, run);
    } else {
      const head = start === 0 ? 0 : Math.min(CONTEXT, run.length);
      const tail = end === lines.length ? 0 : Math.min(CONTEXT, run.length);
      const middle = run.length - head - tail;
      if (middle > 2) {
        push(undefined, run.slice(0, head));
        push('unchanged', run.slice(head, run.length - tail));
        push(undefined, run.slice(run.length - tail));
      } else {
        push(undefined, run);
      }
    }
    start = end;
  }
  return runs;
}

/** The words on a fold's expander: `… 4 unchanged lines`, `… 3 comment lines removed`, `… 2 comment lines and 1 blank line added`. */
export function foldLabel(run: DiffRun): string {
  if (run.fold === 'unchanged') {
    return `… ${count(run.lines.length, 'unchanged line')}`;
  }
  const blank = run.lines.filter(l => l.text.trim() === '').length;
  const comments = run.lines.length - blank;
  const words = [
    comments > 0 ? count(comments, 'comment line') : '',
    blank > 0 ? count(blank, 'blank line') : '',
  ]
    .filter(Boolean)
    .join(' and ');
  return `… ${words} ${run.lines[0].kind}`;
}
