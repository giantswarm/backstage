import {
  buildContinuationPrompt,
  ENTRY_MAX_LENGTH,
} from './continuationPrompt';
import type { TimelineItem } from './kagentTimeline';

let nextId = 0;
const base = () => ({ id: `item-${(nextId += 1)}`, taskIndex: 0 });
const user = (text: string): TimelineItem => ({
  ...base(),
  kind: 'user-message',
  text,
});
const agent = (text: string): TimelineItem => ({
  ...base(),
  kind: 'agent-message',
  text,
});
const tool = (toolName: string): TimelineItem => ({
  ...base(),
  kind: 'tool-call',
  toolName,
  args: { secret: 'never carried' },
  result: 'a large result',
  isPending: false,
});
const asked = (
  questions: string[],
  verdict?: 'approved' | 'rejected',
): TimelineItem => ({
  ...base(),
  kind: 'approval',
  asks: 'input',
  toolName: 'ask_user',
  questions,
  verdict,
});

const conversation: TimelineItem[] = [
  user('I want to invent a recipe for fried potatoes'),
  { ...base(), kind: 'reasoning', text: 'Thinking about potatoes.' },
  tool('read_file'),
  tool('search'),
  tool('search'),
  agent('Is it a side or a meal?'),
  asked(['Is it a side or a meal?'], 'approved'),
  user('A meal'),
  agent('Which protein?'),
  asked(['Which protein?']),
];

const pendingQuestions = [
  { question: 'Which protein?', choices: ['Egg', 'Bacon'], multiple: false },
];

describe('buildContinuationPrompt', () => {
  it('frames the conversation, the open question and the answer for the model', () => {
    const { text, messageCount, includedMessageCount } =
      buildContinuationPrompt({
        items: conversation,
        pendingQuestions,
        answers: [['Egg']],
      });

    expect(text).toMatch(
      /^I am continuing a session with you that could not be resumed/,
    );
    expect(text).toContain(
      [
        '## Earlier conversation',
        '',
        'User: I want to invent a recipe for fried potatoes',
        '',
        '[Assistant used tools: read_file, search (2×)]',
        '',
        'Assistant asked:\n- Is it a side or a meal?',
        '',
        'User: A meal',
        '',
        '## Your last question',
        '',
        '1. Which protein?\n   Choices: Egg; Bacon',
        '',
        '## My answer',
        '',
        '1. Egg',
      ].join('\n'),
    );
    // Three messages: the first, the question asked, the answer to it. The
    // agent's echo of each question is carried once, as the question.
    expect(messageCount).toBe(3);
    expect(includedMessageCount).toBe(3);
  });

  it('names tools without their arguments or results, and leaves out reasoning', () => {
    const { text } = buildContinuationPrompt({
      items: conversation,
      pendingQuestions,
      answers: [['Egg']],
    });

    expect(text).not.toContain('never carried');
    expect(text).not.toContain('a large result');
    expect(text).not.toContain('Thinking about potatoes');
  });

  it('carries what the person typed in place of the answer', () => {
    const { text } = buildContinuationPrompt({
      items: conversation,
      pendingQuestions,
      answers: [['Egg']],
      reply: '  Bacon, crispy  ',
    });

    expect(text).toMatch(/## My answer\n\nBacon, crispy$/);
    expect(text).not.toContain('1. Egg');
  });

  it('notes approvals, attachments and ended turns in a line each', () => {
    const { text } = buildContinuationPrompt({
      items: [
        {
          ...base(),
          kind: 'approval',
          asks: 'approval',
          toolName: 'delete_pod',
          verdict: 'rejected',
        },
        {
          ...base(),
          kind: 'attachment',
          name: 'shot.png',
          isUser: true,
          preview: { kind: 'none', reason: 'remote' },
        },
        { ...base(), kind: 'turn-failed', state: 'failed', reason: 'boom' },
        { ...base(), kind: 'turn-failed', state: 'canceled' },
      ],
      pendingQuestions: [],
    });

    expect(text).toContain('[Assistant asked to run delete_pod: rejected]');
    expect(text).toContain('[User attached a file: shot.png]');
    expect(text).toContain('[That turn failed: boom]');
    expect(text).toContain('[That turn was stopped.]');
    expect(text).not.toContain('## Your last question');
    expect(text).toMatch(/Please carry on from there\./);
  });

  it('cuts one long message rather than dropping it', () => {
    const { text } = buildContinuationPrompt({
      items: [user('x'.repeat(ENTRY_MAX_LENGTH + 500))],
      pendingQuestions,
      answers: [['Egg']],
    });

    expect(text).toContain(
      `User: ${'x'.repeat(ENTRY_MAX_LENGTH)} … [shortened]`,
    );
  });

  it('keeps the newest messages within the limit and says how many it left out', () => {
    const items = Array.from({ length: 40 }, (_, index) =>
      user(`message ${index} ${'y'.repeat(200)}`),
    );
    const maxLength = 3_000;

    const { text, messageCount, includedMessageCount } =
      buildContinuationPrompt({
        items,
        pendingQuestions,
        answers: [['Egg']],
        maxLength,
      });

    expect(text.length).toBeLessThanOrEqual(maxLength);
    expect(messageCount).toBe(40);
    expect(includedMessageCount).toBeGreaterThan(0);
    expect(includedMessageCount).toBeLessThan(40);
    expect(text).toContain(
      `[${40 - includedMessageCount} earlier messages are left out for length.]`,
    );
    // The newest survive, the oldest go; the question and answer always fit.
    expect(text).toContain('message 39 ');
    expect(text).not.toContain('message 0 ');
    expect(text).toMatch(/## My answer\n\n1\. Egg$/);
  });

  it('shortens a reply typed to the limit rather than overflowing it', () => {
    const maxLength = 3_000;
    const { text } = buildContinuationPrompt({
      items: [user('hello')],
      pendingQuestions,
      reply: 'z'.repeat(maxLength),
      maxLength,
    });

    expect(text.length).toBeLessThanOrEqual(maxLength);
    expect(text).toContain('… [shortened]');
  });
});
