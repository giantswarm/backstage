export interface DiffLine {
  type: 'hunk' | 'add' | 'del' | 'context';
  /** Line content without the leading diff marker. */
  text: string;
  oldLine?: number;
  /** New-file line number -- the anchor for RIGHT-side review comments. */
  newLine?: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parse a GitHub unified diff patch into typed lines with old/new line
 * numbers, so the diff view can anchor review comments the way GitHub does.
 */
export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split('\n')) {
    const hunk = raw.match(HUNK_HEADER);
    if (hunk) {
      oldLine = parseInt(hunk[1], 10);
      newLine = parseInt(hunk[2], 10);
      lines.push({ type: 'hunk', text: raw });
      continue;
    }
    if (raw.startsWith('+')) {
      lines.push({ type: 'add', text: raw.slice(1), newLine: newLine++ });
    } else if (raw.startsWith('-')) {
      lines.push({ type: 'del', text: raw.slice(1), oldLine: oldLine++ });
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" -- display only, no line numbers.
      lines.push({ type: 'context', text: raw });
    } else {
      lines.push({
        type: 'context',
        text: raw.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
      });
    }
  }
  return lines;
}
