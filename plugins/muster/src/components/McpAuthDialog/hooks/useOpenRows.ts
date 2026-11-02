import { useState } from 'react';

/**
 * The names a list shows while a dialog is open: those waiting when it
 * opened, plus any that start to wait while it is, so a finished sign-in
 * turns its row connected instead of making it vanish. Kept as state adjusted
 * while rendering, so the read that brings a row and the count that names it
 * land in the same frame; closing the dialog empties it.
 */
export function useOpenRows(
  isOpen: boolean,
  waiting: readonly string[],
): string[] {
  const [rows, setRows] = useState<string[]>([]);
  if (!isOpen) {
    if (rows.length > 0) {
      setRows([]);
    }
    return [];
  }
  const added = waiting.filter(name => !rows.includes(name));
  if (added.length === 0) {
    return rows;
  }
  const next = [...rows, ...added].sort();
  setRows(next);
  return next;
}
