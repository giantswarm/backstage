/**
 * A line diff of two texts, computed on the page: the file on record
 * against the file the definition renders. Small enough to need no library;
 * the files are configuration of a few hundred lines at most.
 */

export interface DiffLine {
  kind: 'context' | 'removed' | 'added';
  text: string;
  /** 1-based line in the text on record; absent on an added line. */
  currentLine?: number;
  /** 1-based line in the rendered text; absent on a removed line. */
  line?: number;
}

/** A run of lines of the diff: shown, or folded behind an expander where nothing changed. */
export interface DiffRun {
  folded: boolean;
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

/**
 * The line diff of `current` (on record) against `content` (rendered): the
 * longest common subsequence of lines is the context, the rest is removed
 * from the record or added by the render, removals first.
 */
export function diffLines(current: string, content: string): DiffLine[] {
  const a = splitLines(current);
  const b = splitLines(content);
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  // lcs[i * width + j]: the longest common subsequence of a[i:] and b[j:].
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({
        kind: 'context',
        text: a[i],
        currentLine: i + 1,
        line: j + 1,
      });
      i++;
      j++;
    } else if (
      i < n &&
      (j >= m || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])
    ) {
      out.push({ kind: 'removed', text: a[i], currentLine: i + 1 });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j], line: j + 1 });
      j++;
    }
  }
  return out;
}

/** The unchanged lines kept on each side of a change. */
export const CONTEXT = 2;

/**
 * The diff in runs: changed lines with `CONTEXT` unchanged lines around
 * them, and the longer unchanged stretches folded. A stretch of one or two
 * lines is not worth an expander and stays shown.
 */
export function foldContext(lines: DiffLine[]): DiffRun[] {
  const runs: DiffRun[] = [];
  const push = (folded: boolean, part: DiffLine[]) => {
    if (part.length === 0) {
      return;
    }
    const last = runs[runs.length - 1];
    if (last && last.folded === folded) {
      last.lines.push(...part);
    } else {
      runs.push({ folded, lines: [...part] });
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
      push(false, run);
    } else {
      const head = start === 0 ? 0 : Math.min(CONTEXT, run.length);
      const tail = end === lines.length ? 0 : Math.min(CONTEXT, run.length);
      const middle = run.length - head - tail;
      if (middle > 2) {
        push(false, run.slice(0, head));
        push(true, run.slice(head, run.length - tail));
        push(false, run.slice(run.length - tail));
      } else {
        push(false, run);
      }
    }
    start = end;
  }
  return runs;
}
