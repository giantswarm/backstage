import {
  A2aMessageWire,
  isThoughtPart,
  parsePart,
  readKagentNotice,
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

/** A notice's proposed mark, not sent by kagent yet (`readKagentNotice`). */
const NOTICE_MARK = 'workspace-setup';

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
  /**
   * Repositories left at the workspace's last sync, each with its reason.
   * `note` holds what came with the list but is not a repository line.
   */
  | {
      kind: 'stale';
      repositories: { name: string; reason?: string }[];
      note?: string;
    }
  /** A line this portal does not know yet, kept as kagent wrote it. */
  | { kind: 'other'; text: string };

export type WorkspaceNoticeSeverity = 'warning' | 'info';

export type WorkspaceNotice = {
  /** The notice as kagent wrote it, trimmed: what tells a repeat of it. */
  text: string;
  /** Its variants, in the order kagent wrote them. Never empty. */
  entries: WorkspaceNoticeEntry[];
  /** The most severe of its entries' ({@link entrySeverity}). */
  severity: WorkspaceNoticeSeverity;
};

/** Where a candidate message sits in its turn. */
export type NoticePosition = {
  /**
   * The message opens the agent's side of its turn: nothing from the agent
   * came before it, and kagent recorded it as a message, not as an output
   * artifact or the completed task's status message. The harness sends a
   * notice as the turn's first `status-update`, so only such a message is
   * tested for the prefix; a reply that happens to start with the same words
   * stays a reply.
   */
  opensTurn: boolean;
};

/**
 * The notice's text when a message is one, else undefined. A marked message is
 * one wherever it sits; until kagent marks notices, the only tell is an agent
 * message of text alone, opening its turn, that starts with "Workspace
 * setup". A message that also carries a call or a file is the model's.
 */
function readNoticeText(
  message: A2aMessageWire,
  { opensTurn }: NoticePosition,
): string | undefined {
  if (message.role === 'user') {
    return undefined;
  }
  const marked = readKagentNotice(message.metadata) === NOTICE_MARK;
  if (!marked && !opensTurn) {
    return undefined;
  }
  const chunks: string[] = [];
  for (const rawPart of Array.isArray(message.parts) ? message.parts : []) {
    const part = parsePart(rawPart);
    const text = part && !isThoughtPart(part) ? readPartText(part) : undefined;
    if (text !== undefined) {
      chunks.push(text);
    } else if (!marked) {
      return undefined;
    }
  }
  const text = chunks.join('\n').trim();
  if (!text) {
    return undefined;
  }
  return marked || text.startsWith(NOTICE_PREFIX) ? text : undefined;
}

/**
 * Whether a message is a workspace setup notice rather than something the
 * agent said. The one place that decides; see {@link NoticePosition} for why
 * the position matters.
 */
export function isWorkspaceNotice(
  message: A2aMessageWire,
  position: NoticePosition,
): boolean {
  return readNoticeText(message, position) !== undefined;
}

/** The notice a message carries, or undefined when it is not one. */
export function readWorkspaceNotice(
  message: A2aMessageWire,
  position: NoticePosition,
): WorkspaceNotice | undefined {
  const text = readNoticeText(message, position);
  return text === undefined ? undefined : parseWorkspaceNotice(text);
}

/**
 * One repository per line, under a list's header: `- owner/repo: reason` as
 * kagent writes it, and forgiving of other bullets and of anything but a
 * colon between the name and the reason (`- owner/repo (main): …`,
 * `* owner/repo — …`).
 */
const REPOSITORY_LINE = /^[-*•]\s+(\S+?)(?::\s*(.*)|\s+(?:[—–-]\s*)?(.*))?$/;

/** A repository's `owner/name`, as far as a list's text is concerned. */
const REPOSITORY_NAME = /^[\w.-]+(?:\/[\w.-]+)+$/;

function readRepositoryLine(
  line: string,
): { name: string; reason?: string } | undefined {
  const match = REPOSITORY_LINE.exec(line);
  if (!match) {
    return undefined;
  }
  const reason = (match[2] ?? match[3])?.trim();
  return reason ? { name: match[1], reason } : { name: match[1] };
}

/**
 * The names in `acme/app, acme/docs.`, or undefined when any of it is not a
 * repository name, so a sentence is never taken for a list.
 */
function readNameList(text: string): string[] | undefined {
  const names = text
    .replace(/\.$/, '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  return names.length > 0 && names.every(name => REPOSITORY_NAME.test(name))
    ? names
    : undefined;
}

const join = (head: string | undefined, line: string) =>
  head ? `${head}\n${line}` : line;

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
  const stale = /\bstay at the workspace.s last sync\b[.:]?\s*(.*)$/i.exec(
    rest,
  );
  if (stale) {
    // The list is meant to follow on lines of its own; one that comes on the
    // header line is read as names, and anything else kept as a note.
    const after = stale[1].trim();
    if (!after) {
      return { kind: 'stale', repositories: [] };
    }
    const names = readNameList(after);
    return names
      ? { kind: 'stale', repositories: names.map(name => ({ name })) }
      : { kind: 'stale', repositories: [], note: after };
  }
  if (/\bset up again\b/i.test(rest)) {
    return {
      kind: 'reset',
      text: rest.charAt(0).toUpperCase() + rest.slice(1),
    };
  }
  return { kind: 'other', text: line };
}

/**
 * A line that starts no variant, given the entry before it. Returns a new
 * entry when the line cannot belong to that one, so it is kept on its own
 * rather than dropped.
 */
function continueEntry(
  entry: WorkspaceNoticeEntry,
  line: string,
): WorkspaceNoticeEntry | undefined {
  switch (entry.kind) {
    case 'failed':
      entry.error = join(entry.error, line);
      return undefined;
    case 'stale': {
      const repository = readRepositoryLine(line);
      const last = entry.repositories.at(-1);
      if (repository) {
        entry.repositories.push(repository);
      } else if (last) {
        // A reason that ran over several lines.
        last.reason = join(last.reason, line);
      } else {
        entry.note = join(entry.note, line);
      }
      return undefined;
    }
    case 'recovered': {
      const repository = readRepositoryLine(line);
      const names = repository ? [repository.name] : readNameList(line);
      if (!names) {
        return { kind: 'other', text: line };
      }
      entry.repositories.push(...names);
      return undefined;
    }
    default:
      entry.text = join(entry.text, line);
      return undefined;
  }
}

/**
 * Read a notice's text into its variants.
 *
 * One notice can hold several, one per line, each starting with "Workspace
 * setup"; a "last sync" line is followed by one `- owner/repo: reason` line
 * per repository. A line that starts nothing carries on the entry before it.
 * Nothing is dropped: text this reader does not recognise is kept, as an
 * `other` entry or a list's note, and shown as kagent wrote it.
 */
export function parseWorkspaceNotice(text: string): WorkspaceNotice {
  const entries: WorkspaceNoticeEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const current = entries.at(-1);
    const entry =
      readEntryLine(line) ??
      (current ? continueEntry(current, line) : { kind: 'other', text: line });
    if (entry) {
      entries.push(entry);
    }
  }
  if (entries.length === 0) {
    entries.push({ kind: 'other', text: text.trim() });
  }
  return {
    text: text.trim(),
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

/** "3 repositories", or "some repositories" when the list could not be read. */
function repositories(count: number): string {
  return count > 0
    ? countNoun(count, 'repository', 'repositories')
    : 'some repositories';
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
