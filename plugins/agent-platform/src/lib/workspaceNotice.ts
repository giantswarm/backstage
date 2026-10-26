import {
  A2aMessageWire,
  isRecord,
  isThoughtPart,
  parsePart,
  readMessageText,
  readPartText,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { countNoun } from '@giantswarm/backstage-plugin-ui-react';

/**
 * A workspace setup notice: what kagent's harness reports about the session's
 * directory before a turn starts (`Report.TurnNotice()` in kagent's
 * `go/harness/workspace/workspace.go`).
 *
 * It travels as the turn's first `status-update`, an agent message with one
 * text part, and stays in the task's history. kagent calls it "a status line
 * the runtime reports to the person about the turn … It is not assistant text
 * and never reaches the model", so the timeline renders it as a status of the
 * turn, never as the agent's reply.
 */

/** What every notice text starts with, and each of its variants' lines. */
const NOTICE_PREFIX = 'Workspace setup';

/**
 * The marker kagent is expected to put on a notice, so it no longer has to be
 * recognised by its words. Read under the public metadata contract's
 * `kagent.dev/a2a/` prefix too, wherever kagent settles on.
 */
const NOTICE_METADATA_KEYS = ['kagent.dev/notice', 'kagent.dev/a2a/notice'];
const NOTICE_METADATA_VALUE = 'workspace-setup';

/** One variant of a notice: one line, or a header line and its list. */
export type WorkspaceNoticeEntry =
  /** The session's directory could not be set up at all. */
  | { kind: 'failed'; error?: string }
  /**
   * The directory was set up again from the workspace's mirrors, and what was
   * not pushed is gone. `text` is kagent's sentence, without the prefix.
   */
  | { kind: 'reset'; text: string }
  /** Repositories an earlier turn could not clone or fetch, up to date now. */
  | { kind: 'recovered'; repositories: string[] }
  /** Repositories left at the workspace's last sync, each with its reason. */
  | {
      kind: 'stale';
      repositories: { name: string; reason?: string }[];
    }
  /** A line this portal does not know yet, kept as kagent wrote it. */
  | { kind: 'other'; text: string };

export type WorkspaceNoticeSeverity = 'warning' | 'info';

export type WorkspaceNotice = {
  /** Its variants, in the order kagent wrote them. Never empty. */
  entries: WorkspaceNoticeEntry[];
  /** The most severe of its entries' ({@link entrySeverity}). */
  severity: WorkspaceNoticeSeverity;
};

/**
 * Whether a message is a workspace setup notice rather than something the
 * agent said.
 *
 * Until kagent marks notices, the only tell is the text: an agent message of
 * text alone that starts with "Workspace setup". A message that also carries a
 * call or a file is the model's, whatever its words. Once the metadata marker
 * is set, it decides on its own, and the prefix test can go.
 */
export function isWorkspaceNotice(message: A2aMessageWire): boolean {
  if (message.role === 'user') {
    return false;
  }
  const bag = isRecord(message.metadata) ? message.metadata : undefined;
  if (NOTICE_METADATA_KEYS.some(key => bag?.[key] === NOTICE_METADATA_VALUE)) {
    return true;
  }
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const textOnly = parts.every(rawPart => {
    const part = parsePart(rawPart);
    return (
      part !== undefined &&
      readPartText(part) !== undefined &&
      !isThoughtPart(part)
    );
  });
  return (
    textOnly && (readMessageText(message)?.startsWith(NOTICE_PREFIX) ?? false)
  );
}

/** The notice a message carries, or undefined when it is not one. */
export function readWorkspaceNotice(
  message: A2aMessageWire,
): WorkspaceNotice | undefined {
  if (!isWorkspaceNotice(message)) {
    return undefined;
  }
  const text = readMessageText(message);
  return text ? parseWorkspaceNotice(text) : undefined;
}

/** `- owner/repo: reason`, one per repository under a "last sync" line. */
const REPOSITORY_LINE = /^-\s+([^\s:]+)(?::\s*(.*))?$/;

/** One variant's header line, or undefined when the line starts none. */
function readEntryLine(line: string): WorkspaceNoticeEntry | undefined {
  if (!line.startsWith(NOTICE_PREFIX)) {
    return undefined;
  }
  const failed = /^Workspace setup failed\b:?\s*(.*)$/i.exec(line);
  if (failed) {
    return failed[1]
      ? { kind: 'failed', error: failed[1] }
      : { kind: 'failed' };
  }
  const rest = line.slice(NOTICE_PREFIX.length).replace(/^:\s*/, '');
  // Keyed on the phrase that names each variant rather than the whole
  // sentence, so a reworded clause around it still reads as the same variant.
  const recovered = /\bup to date now:\s*(.*)$/i.exec(rest);
  if (recovered) {
    return {
      kind: 'recovered',
      repositories: recovered[1]
        .replace(/\.$/, '')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean),
    };
  }
  if (/\bstay at the workspace.s last sync\b/i.test(rest)) {
    return { kind: 'stale', repositories: [] };
  }
  if (/\bset up again\b/i.test(rest)) {
    return {
      kind: 'reset',
      text: rest.charAt(0).toUpperCase() + rest.slice(1),
    };
  }
  return { kind: 'other', text: line };
}

/** A line that carries on the entry before it: a reason or an error that wrapped. */
function continueEntry(entry: WorkspaceNoticeEntry, line: string) {
  const join = (head: string | undefined) => (head ? `${head}\n${line}` : line);
  switch (entry.kind) {
    case 'failed':
      entry.error = join(entry.error);
      return;
    case 'stale': {
      const last = entry.repositories.at(-1);
      if (last) {
        last.reason = join(last.reason);
      }
      return;
    }
    case 'reset':
    case 'other':
      entry.text = join(entry.text);
      return;
    default:
      return;
  }
}

/**
 * Read a notice's text into its variants.
 *
 * One notice can hold several, one per line, each starting with "Workspace
 * setup"; a "last sync" line is followed by one `- owner/repo: reason` line
 * per repository. A line that starts nothing carries on the entry before it.
 * Nothing is dropped: text this reader does not recognise becomes an `other`
 * entry, shown as kagent wrote it.
 */
export function parseWorkspaceNotice(text: string): WorkspaceNotice {
  const entries: WorkspaceNoticeEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const entry = readEntryLine(line);
    if (entry) {
      entries.push(entry);
      continue;
    }
    const current = entries.at(-1);
    const repository =
      current?.kind === 'stale' ? REPOSITORY_LINE.exec(line) : null;
    if (current?.kind === 'stale' && repository) {
      current.repositories.push(
        repository[2]
          ? { name: repository[1], reason: repository[2] }
          : { name: repository[1] },
      );
    } else if (current) {
      continueEntry(current, line);
    } else {
      // Only a notice recognised by its marker can open without the prefix.
      entries.push({ kind: 'other', text: line });
    }
  }
  if (entries.length === 0) {
    entries.push({ kind: 'other', text: text.trim() });
  }
  return {
    entries,
    severity: entries.some(entry => entrySeverity(entry) === 'warning')
      ? 'warning'
      : 'info',
  };
}

/**
 * How much an entry matters to the person.
 *
 * A warning where the agent works on something other than what the person
 * may expect: no directory, unpushed work gone, or repositories behind their
 * provider. Repositories that are up to date again only report a recovery.
 */
export function entrySeverity(
  entry: WorkspaceNoticeEntry,
): WorkspaceNoticeSeverity {
  switch (entry.kind) {
    case 'failed':
    case 'reset':
    case 'stale':
      return 'warning';
    default:
      return 'info';
  }
}

function repositories(count: number): string {
  return countNoun(count, 'repository', 'repositories');
}

/** An entry in one line, as the notice's title or a line under it. */
export function summarizeEntry(entry: WorkspaceNoticeEntry): string {
  switch (entry.kind) {
    case 'failed':
      return 'Workspace setup failed';
    case 'reset':
      return 'Workspace setup: directory set up again';
    case 'recovered':
      return `Workspace setup: ${repositories(entry.repositories.length)} up to date again`;
    case 'stale':
      return `Workspace setup: ${repositories(entry.repositories.length)} not updated`;
    default:
      return entry.text.split('\n')[0];
  }
}

/**
 * The entry a notice is titled by: its first warning, else its first entry.
 * The rest are listed under it.
 */
export function leadingEntryIndex(notice: WorkspaceNotice): number {
  const index = notice.entries.findIndex(
    entry => entrySeverity(entry) === notice.severity,
  );
  return Math.max(0, index);
}
