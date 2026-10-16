import type { SeenMarkTarget } from '@giantswarm/backstage-plugin-agent-platform';
import type { StatusDotTone } from '@giantswarm/backstage-plugin-ui-react';

/** An action in a row's ⋯ menu. */
export type InboxRowAction = {
  id: string;
  label: string;
  onAction: () => void;
};

/**
 * One row of the Notification inbox. The overlay, the badge, the title count,
 * the toasts and desktop notifications only ever see this shape, so a later
 * producer adds rows of its own without reshaping any of them.
 */
export type InboxRow = {
  /**
   * The row's identity: a React key, the desktop notification's `tag`, what
   * a tab remembers it announced. A changed id is a new row.
   */
  id: string;
  /**
   * What the row is about, such as one session; a subject has one row at a
   * time. A subject whose state the tab had already read is being watched, so
   * a new row of it is news whatever the clocks say.
   */
  subject: string;
  /** What happened, for analytics: the kind of row the person opened. */
  kind: 'waiting' | 'failed' | 'turnFinished';
  /** When it happened (ms since the epoch); rows sort newest first. */
  at?: number;
  /** Not yet seen by the person, on any tab or device. */
  unread: boolean;
  /** What happened, naming who: "SRE Agent needs your input". */
  title: string;
  /** What it is about: the session's name. */
  context?: string;
  /** A short addition after the age, such as a failure's reason class. */
  detail?: string;
  /** The state chip. */
  state?: { label: string; tone: StatusDotTone };
  /** The agent's Avatar, by Display name. */
  avatar?: { name: string; src?: string };
  /** Where clicking the row goes (absolute). */
  href?: string;
  /** How a toast or a desktop notification says it. */
  announce: {
    title: string;
    description?: string;
    status: 'warning' | 'danger' | 'success' | 'info';
    linkLabel: string;
  };
  /** The row's entry in the person's Seen record. */
  seenMark: SeenMarkTarget;
  /** The row's ⋯ menu. */
  actions?: InboxRowAction[];
};

/** What the session rows' source gives the inbox. */
export type InboxRowSource = {
  rows: InboxRow[];
  /**
   * Every subject whose state this read has, row or not: what the tab is
   * watching.
   */
  subjects: ReadonlySet<string>;
  /**
   * The source has read once, everywhere it reads, and the Seen record is
   * known: the rows now are the tab's first read. Until then nothing is
   * announced.
   */
  ready: boolean;
};
