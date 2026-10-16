import { MESSAGE_TEXT_MAX_LENGTH } from '@giantswarm/backstage-plugin-agent-platform-common';
import type { AskUserQuestion } from './kagentHitl';
import type { TimelineItem } from './kagentTimeline';

/**
 * The first message of a session that carries on one kagent could not resume.
 *
 * A new session starts with an empty model history, so "continuing" means
 * telling the agent what was said: the earlier conversation, the question it
 * asked last and the person's answer, framed so the model reads them as a
 * record rather than as new instructions from three different speakers.
 *
 * What goes in, from the page's own timeline (the whole conversation, read
 * from kagent's task history):
 *
 * - every message the person and the agent wrote, oldest first, each cut at
 *   {@link ENTRY_MAX_LENGTH};
 * - the questions the agent asked, and what it asked to run, with the verdict;
 * - tool and agent calls **by name only**, consecutive ones on one line: a
 *   result can be any size, and the new session can call the tool again
 *   rather than trust a stale copy;
 * - attachments by name, and turns that failed or were stopped;
 * - not the model's reasoning, which was never part of what either side said.
 *
 * The whole message stays within {@link MESSAGE_TEXT_MAX_LENGTH}, the bound the
 * send route enforces. The open question and the answer always fit; the
 * conversation gives way from its oldest end, and the message says how many
 * messages it left out.
 */

/** The session a continuation carries on, as the route names it. */
export type ContinuedSession = { installation: string; sessionId: string };

// Installation names and kagent session ids as the portal routes them. A value
// outside these is not written, so the marker always reads back as written.
const INSTALLATION_PATTERN = '[a-z0-9][a-z0-9-]*';
const SESSION_ID_PATTERN = '[A-Za-z0-9][A-Za-z0-9._-]*';

/**
 * The first line of a continuation: which session it carries on, for the page
 * to show as a banner with a link. One bracketed line, so it reads plainly to
 * the model and wherever the raw text shows (Slack, kagent's UI).
 *
 * Recognised only at the very start of a session's first user message
 * ({@link readContinuationMarker}), so the same words later in a
 * conversation stay text.
 */
const MARKER = new RegExp(
  `^\\[Continues session (${INSTALLATION_PATTERN})/(${SESSION_ID_PATTERN})\\][ \\t]*(?:\\r?\\n)+`,
);

export function continuationMarker({
  installation,
  sessionId,
}: ContinuedSession): string | undefined {
  const line = `[Continues session ${installation}/${sessionId}]`;
  return MARKER.test(`${line}\n`) ? line : undefined;
}

/**
 * The session a message continues, and the message without its marker line —
 * or undefined when the message does not start with one.
 */
export function readContinuationMarker(
  text: string,
): (ContinuedSession & { rest: string }) | undefined {
  const match = MARKER.exec(text);
  if (!match) {
    return undefined;
  }
  return {
    installation: match[1],
    sessionId: match[2],
    rest: text.slice(match[0].length),
  };
}

/**
 * The timeline with the session's first user message read for a marker: the
 * session it continues, and the items with that line taken out of the
 * message, which the page shows as a banner instead.
 */
export function splitContinuation(items: TimelineItem[]): {
  items: TimelineItem[];
  continues?: ContinuedSession;
} {
  const index = items.findIndex(item => item.kind === 'user-message');
  const first = items[index];
  if (!first || first.kind !== 'user-message') {
    return { items };
  }
  const marker = readContinuationMarker(first.text);
  if (!marker) {
    return { items };
  }
  const { rest, ...continues } = marker;
  const stripped = [...items];
  stripped[index] = { ...first, text: rest };
  return { items: stripped, continues };
}

/** The longest any one earlier message is carried, before it is cut. */
export const ENTRY_MAX_LENGTH = 4_000;

/** Room kept free under the limit, for the counts the omission note adds. */
const SLACK = 200;

export type ContinuationInput = {
  /** The conversation so far, as the page renders it. */
  items: TimelineItem[];
  /** The questions the session is waiting on, with their choices. */
  pendingQuestions: AskUserQuestion[];
  /** The answer that was not taken, positionally per question. */
  answers?: string[][];
  /**
   * What the person typed in the box instead, which replaces the answer.
   * Blank counts as nothing typed.
   */
  reply?: string;
  /** The session this carries on, named on the message's first line. */
  continues?: ContinuedSession;
  /** Overridable for tests. */
  maxLength?: number;
};

export type Continuation = {
  /** The first message for the new session. */
  text: string;
  /** Messages the person and the agent wrote in the conversation. */
  messageCount: number;
  /** How many of them the text carries; fewer when it had to cut. */
  includedMessageCount: number;
};

type Entry = { text: string; isMessage: boolean };

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max
    ? `${trimmed.slice(0, max).trimEnd()} … [shortened]`
    : trimmed;
}

/** An agent message that only repeats the questions its `ask_user` asks. */
function isQuestionEcho(text: string, questions: string[]): boolean {
  const said = text.trim();
  return (
    questions.length > 0 &&
    (said === questions.join('; ').trim() ||
      questions.some(question => question.trim() === said))
  );
}

function toolLine(names: string[]): string {
  const counted = new Map<string, number>();
  for (const name of names) {
    counted.set(name, (counted.get(name) ?? 0) + 1);
  }
  const listed = [...counted]
    .map(([name, count]) => (count > 1 ? `${name} (${count}×)` : name))
    .join(', ');
  return `[Assistant used ${names.length === 1 ? 'a tool' : 'tools'}: ${listed}]`;
}

/**
 * The conversation as entries, oldest first. The pending question is left
 * out: it has its own section at the end.
 */
function readEntries(items: TimelineItem[]): Entry[] {
  let pendingIndex = -1;
  items.forEach((item, index) => {
    if (
      item.kind === 'approval' &&
      item.asks === 'input' &&
      item.verdict === undefined
    ) {
      pendingIndex = index;
    }
  });
  const entries: Entry[] = [];
  let tools: string[] = [];
  const flushTools = () => {
    if (tools.length > 0) {
      entries.push({ text: toolLine(tools), isMessage: false });
      tools = [];
    }
  };

  items.forEach((item, index) => {
    if (item.kind === 'tool-call' || item.kind === 'agent-call') {
      tools.push(item.kind === 'tool-call' ? item.toolName : item.agentId);
      return;
    }
    if (item.kind === 'reasoning') {
      return;
    }
    flushTools();
    switch (item.kind) {
      case 'user-message':
        entries.push({
          text: `User: ${clip(item.text, ENTRY_MAX_LENGTH)}`,
          isMessage: true,
        });
        return;
      case 'agent-message': {
        // The agent often says its question before asking it; the question
        // entry (or the final section) carries it once.
        const next = items
          .slice(index + 1)
          .find(later => later.kind !== 'reasoning');
        if (
          next?.kind === 'approval' &&
          next.asks === 'input' &&
          isQuestionEcho(item.text, next.questions ?? [])
        ) {
          return;
        }
        entries.push({
          text: `Assistant: ${clip(item.text, ENTRY_MAX_LENGTH)}`,
          isMessage: true,
        });
        return;
      }
      case 'approval':
        if (index === pendingIndex) {
          return;
        }
        if (item.asks === 'input') {
          const questions = (item.questions ?? []).map(
            question => `- ${clip(question, ENTRY_MAX_LENGTH)}`,
          );
          entries.push({
            text: `Assistant asked:\n${questions.join('\n')}`,
            isMessage: true,
          });
          return;
        }
        entries.push({
          text: `[Assistant asked to run ${item.toolName ?? 'a tool'}: ${
            item.verdict === undefined ? 'not answered' : item.verdict
          }]`,
          isMessage: false,
        });
        return;
      case 'attachment':
        entries.push({
          text: `[${item.isUser ? 'User attached' : 'Assistant shared'} a file${
            item.name ? `: ${item.name}` : ''
          }]`,
          isMessage: false,
        });
        return;
      case 'turn-failed':
        entries.push({
          text:
            item.state === 'canceled'
              ? '[That turn was stopped.]'
              : `[That turn failed${
                  item.reason ? `: ${clip(item.reason, 300)}` : '.'
                }]`,
          isMessage: false,
        });
        return;
      default:
        return;
    }
  });
  flushTools();
  return entries;
}

function questionSection(questions: AskUserQuestion[]): string {
  return questions
    .map((question, index) => {
      const choices = question.choices?.length
        ? `\n   Choices: ${question.choices.join('; ')}`
        : '';
      return `${index + 1}. ${question.question.trim()}${choices}`;
    })
    .join('\n');
}

function answerSection(answers: string[][]): string {
  return answers
    .map((answer, index) => `${index + 1}. ${answer.join(', ')}`)
    .join('\n');
}

export function buildContinuationPrompt({
  items,
  pendingQuestions,
  answers,
  reply,
  continues,
  maxLength = MESSAGE_TEXT_MAX_LENGTH,
}: ContinuationInput): Continuation {
  const typed = reply?.trim();
  let answer: string | undefined;
  if (typed) {
    answer = typed;
  } else if (answers?.length) {
    answer = answerSection(answers);
  }

  const hasQuestion = pendingQuestions.length > 0;
  const intro = [
    'I am continuing a session with you that could not be resumed, so you do not have its history. Below is our earlier conversation, oldest first: what I wrote, what you replied, and the tools you used, named without their results.',
    hasQuestion
      ? 'It ends with the question you asked last and my answer to it, which could not reach you in that session. Please carry on from there.'
      : 'Please carry on from there.',
  ].join(' ');

  const tailWith = (shown: string | undefined) =>
    [
      hasQuestion &&
        `## Your last question\n\n${questionSection(pendingQuestions)}`,
      shown && `## ${hasQuestion ? 'My answer' : 'My reply'}\n\n${shown}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  let tail = tailWith(answer);

  const marker = continues ? continuationMarker(continues) : undefined;
  const frame = (conversation: string) =>
    [marker, intro, `## Earlier conversation\n\n${conversation}`, tail]
      .filter(Boolean)
      .join('\n\n');

  // The answer is the one part that must arrive whole; only a reply typed to
  // the limit can crowd it, and then it gives way rather than the framing.
  const overflow = frame('').length + SLACK - maxLength;
  if (overflow > 0 && answer) {
    tail = tailWith(clip(answer, Math.max(0, answer.length - overflow)));
  }

  const entries = readEntries(items);
  const messageCount = entries.filter(entry => entry.isMessage).length;
  let budget = maxLength - frame('').length - SLACK;
  const kept: Entry[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const cost = entries[index].text.length + 2;
    if (cost > budget) {
      break;
    }
    kept.unshift(entries[index]);
    budget -= cost;
  }
  const includedMessageCount = kept.filter(entry => entry.isMessage).length;
  const left = messageCount - includedMessageCount;
  const lines = kept.map(entry => entry.text);
  if (left > 0) {
    lines.unshift(
      `[${left} earlier ${left === 1 ? 'message is' : 'messages are'} left out for length.]`,
    );
  }
  if (lines.length === 0) {
    lines.push('[No earlier messages.]');
  }

  return {
    text: frame(lines.join('\n\n')),
    messageCount,
    includedMessageCount,
  };
}
