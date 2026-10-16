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
 *
 * Nothing the person types goes in: the session that cannot go on shows no
 * message box, so the new session starts with the conversation, and the person
 * writes their next message there.
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

/** How a continuation's framing starts, which is how a nested one is found. */
const INTRO_START =
  'I am continuing a session with you that could not be resumed';

const EARLIER_HEADING = '## Earlier conversation';
const QUESTION_HEADING = '## Your last question';
const ANSWER_HEADING = '## My answer';
/**
 * The headings an answer has been written under. Continuations written before
 * the message box went from these sessions also carry the person's typed
 * text as `## My reply`; a session carried on again still reads it back.
 */
const ANSWER_HEADINGS = [ANSWER_HEADING, '## My reply'];

export type ContinuationInput = {
  /** The conversation so far, as the page renders it. */
  items: TimelineItem[];
  /** The questions the session is waiting on, with their choices. */
  pendingQuestions: AskUserQuestion[];
  /** The answer that did not reach the agent, positionally per question. */
  answers?: string[][];
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

/** The text under one of a continuation's headings, up to the next one. */
function sectionOf(
  body: string,
  heading: string,
  until: string[],
): string | undefined {
  const marker = `\n\n${heading}\n\n`;
  const at = body.lastIndexOf(marker);
  if (at < 0) {
    return undefined;
  }
  const from = at + marker.length;
  const ends = until
    .map(next => body.indexOf(`\n\n${next}\n\n`, from))
    .filter(index => index >= 0);
  return body.slice(from, ends.length ? Math.min(...ends) : undefined).trim();
}

/**
 * The entries a continuation's own first message carries, when a session that
 * was itself a continuation is carried on again. Its earlier conversation, its
 * question and its answer come back as entries of this one, so nothing of the
 * older history is clipped as one long message and no second framing reaches
 * the model. Undefined for any other message.
 */
function expandContinuation(text: string): Entry[] | undefined {
  const body = readContinuationMarker(text)?.rest ?? text;
  if (!body.startsWith(INTRO_START)) {
    return undefined;
  }
  const earlierAt = body.indexOf(`\n\n${EARLIER_HEADING}\n\n`);
  if (earlierAt < 0) {
    return undefined;
  }
  const tail = [QUESTION_HEADING, ...ANSWER_HEADINGS];
  const conversation = sectionOf(body, EARLIER_HEADING, tail) ?? '';
  const question = sectionOf(body, QUESTION_HEADING, ANSWER_HEADINGS);
  const answer = ANSWER_HEADINGS.map(heading =>
    sectionOf(body, heading, []),
  ).find(Boolean);

  // Entries were joined by blank lines; a paragraph that starts no entry of
  // its own belongs to the message before it.
  const entries: Entry[] = [];
  for (const paragraph of conversation.split('\n\n')) {
    const opensMessage = /^(User: |Assistant: |Assistant asked:)/.test(
      paragraph,
    );
    const opensNote = paragraph.startsWith('[');
    if (paragraph === '[No earlier messages.]') {
      continue;
    }
    if (opensMessage || opensNote || entries.length === 0) {
      entries.push({ text: paragraph, isMessage: opensMessage });
    } else {
      entries[entries.length - 1].text += `\n\n${paragraph}`;
    }
  }
  if (question) {
    entries.push({ text: `Assistant asked:\n${question}`, isMessage: true });
  }
  if (answer) {
    entries.push({ text: `User: ${answer}`, isMessage: true });
  }
  return entries.map(entry => ({
    ...entry,
    text: clip(entry.text, ENTRY_MAX_LENGTH),
  }));
}

/**
 * The conversation as entries, oldest first. The open question is left out:
 * it has its own section at the end. It is found by what it asks, the
 * questions the session waits on, not by a missing verdict, which a decision
 * worded in a way the timeline did not recognise also leaves.
 */
function readEntries(
  items: TimelineItem[],
  pendingQuestions: AskUserQuestion[],
): Entry[] {
  const asked = pendingQuestions.map(question => question.question.trim());
  let pendingIndex = -1;
  items.forEach((item, index) => {
    if (
      asked.length > 0 &&
      item.kind === 'approval' &&
      item.asks === 'input' &&
      item.verdict === undefined &&
      (item.questions ?? []).length === asked.length &&
      (item.questions ?? []).every(
        (question, at) => question.trim() === asked[at],
      )
    ) {
      pendingIndex = index;
    }
  });
  const firstUserIndex = items.findIndex(item => item.kind === 'user-message');

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
      case 'user-message': {
        const expanded =
          index === firstUserIndex ? expandContinuation(item.text) : undefined;
        if (expanded) {
          entries.push(...expanded);
          return;
        }
        entries.push({
          text: `User: ${clip(item.text, ENTRY_MAX_LENGTH)}`,
          isMessage: true,
        });
        return;
      }
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
        ? `\n   Choices: ${clip(question.choices.join('; '), ENTRY_MAX_LENGTH)}`
        : '';
      return `${index + 1}. ${clip(question.question, ENTRY_MAX_LENGTH)}${choices}`;
    })
    .join('\n');
}

function answerSection(answers: string[][]): string {
  return answers
    .map((answer, index) => `${index + 1}. ${answer.join(', ')}`)
    .join('\n');
}

/** What the framing says the message ends with, so it never promises a part that is not there. */
function introFor(hasQuestion: boolean, hasAnswer: boolean): string {
  let ending = 'Please carry on from there.';
  if (hasQuestion && hasAnswer) {
    ending = `It ends with the question you asked last and my answer to it, which could not reach you in that session. ${ending}`;
  } else if (hasQuestion) {
    ending = `It ends with the question you asked last, which I have not answered. ${ending}`;
  }
  return `${INTRO_START}, so you do not have its history. Below is our earlier conversation, oldest first: what I wrote, what you replied, and the tools you used, named without their results. ${ending}`;
}

export function buildContinuationPrompt({
  items,
  pendingQuestions,
  answers,
  continues,
  maxLength = MESSAGE_TEXT_MAX_LENGTH,
}: ContinuationInput): Continuation {
  const hasQuestion = pendingQuestions.length > 0;
  // An answer answers the open question; without one there is nothing it is to.
  let answer =
    hasQuestion && answers?.length ? answerSection(answers) : undefined;

  const intro = introFor(hasQuestion, Boolean(answer));
  const marker = continues ? continuationMarker(continues) : undefined;
  let question = hasQuestion ? questionSection(pendingQuestions) : undefined;

  const frame = (conversation: string) =>
    [
      marker,
      intro,
      `${EARLIER_HEADING}\n\n${conversation}`,
      question && `${QUESTION_HEADING}\n\n${question}`,
      answer && `${ANSWER_HEADING}\n\n${answer}`,
    ]
      .filter(Boolean)
      .join('\n\n');

  const entries = readEntries(items, pendingQuestions);
  const messageCount = entries.filter(entry => entry.isMessage).length;

  // The question and the answer are what the new session must act on, so the
  // conversation gives way first. Only an answer or questions near the limit
  // can crowd the frame itself: then the answer gives way, and after it the
  // questions.
  let overflow = frame('').length + SLACK - maxLength;
  if (overflow > 0 && answer) {
    answer = clip(answer, Math.max(0, answer.length - overflow));
    overflow = frame('').length + SLACK - maxLength;
  }
  if (overflow > 0 && question) {
    question = clip(question, Math.max(0, question.length - overflow));
  }

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
    // The last guard: nothing above should reach it.
    text: frame(lines.join('\n\n')).slice(0, maxLength),
    messageCount,
    includedMessageCount,
  };
}
