import {
  buildContinuationPrompt,
  continuationMarker,
  ENTRY_MAX_LENGTH,
  readContinuationMarker,
  splitContinuation,
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
    const maxLength = 10_000;

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

  it('never cuts a reply typed to the limit: it goes on its own', () => {
    const maxLength = 3_000;
    const reply = 'z'.repeat(maxLength - 100);
    const continued = buildContinuationPrompt({
      items: [user('hello')],
      pendingQuestions,
      reply,
      continues: { installation: 'lab', sessionId: '01a1-b2c3' },
      maxLength,
    });

    // After the marker line, so the new session still links back.
    expect(continued.text).toBe(
      `[Continues session lab/01a1-b2c3]\n\n${reply}`,
    );
    expect(continued.includedMessageCount).toBe(0);
    expect(continued.messageCount).toBe(1);

    // Without it where the marker does not fit beside the text.
    const full = 'z'.repeat(maxLength);
    expect(
      buildContinuationPrompt({
        items: [user('hello')],
        pendingQuestions,
        reply: full,
        continues: { installation: 'lab', sessionId: '01a1-b2c3' },
        maxLength,
      }).text,
    ).toBe(full);
  });

  it('shortens a failed answer that alone crowds the limit', () => {
    const maxLength = 3_000;
    const { text } = buildContinuationPrompt({
      items: [user('hello')],
      pendingQuestions,
      answers: [['z'.repeat(maxLength)]],
      maxLength,
    });

    expect(text.length).toBeLessThanOrEqual(maxLength);
    expect(text).toContain('… [shortened]');
  });

  it('names the session it continues on its first line, for the page to find', () => {
    const { text } = buildContinuationPrompt({
      items: conversation,
      pendingQuestions,
      answers: [['Egg']],
      continues: { installation: 'lab', sessionId: '01a1-b2c3' },
    });

    expect(text).toMatch(
      /^\[Continues session lab\/01a1-b2c3\]\n\nI am continuing a session/,
    );
    expect(readContinuationMarker(text)).toEqual({
      installation: 'lab',
      sessionId: '01a1-b2c3',
      rest: expect.stringMatching(/^I am continuing a session/),
    });
  });

  it('writes no marker it could not read back', () => {
    expect(
      continuationMarker({ installation: 'Lab One', sessionId: 'x' }),
    ).toBeUndefined();
    expect(
      continuationMarker({ installation: 'lab', sessionId: 'a/b' }),
    ).toBeUndefined();
    const { text } = buildContinuationPrompt({
      items: [],
      pendingQuestions,
      continues: { installation: 'Lab One', sessionId: 'x' },
    });
    expect(text).toMatch(/^I am continuing a session/);
  });
});

describe('buildContinuationPrompt, review cases', () => {
  it('carries a continued session on again without clipping the older history', () => {
    // B continued A; now B could not be resumed either.
    const first = buildContinuationPrompt({
      items: conversation,
      pendingQuestions,
      answers: [['Egg']],
      continues: { installation: 'lab', sessionId: 'session-a' },
    }).text;
    const sessionB: TimelineItem[] = [
      user(first),
      agent('Egg it is. How crispy?'),
      asked(['How crispy?']),
    ];

    const { text, messageCount } = buildContinuationPrompt({
      items: sessionB,
      pendingQuestions: [{ question: 'How crispy?', multiple: false }],
      answers: [['Very']],
      continues: { installation: 'lab', sessionId: 'session-b' },
    });

    // One framing, one marker: the earlier continuation's own came apart into
    // entries of this one.
    expect(text.match(/I am continuing a session/g)).toHaveLength(1);
    expect(text.match(/\[Continues session/g)).toHaveLength(1);
    expect(text).toMatch(/^\[Continues session lab\/session-b\]/);
    expect(text).toContain(
      [
        'User: I want to invent a recipe for fried potatoes',
        '',
        '[Assistant used tools: read_file, search (2×)]',
        '',
        'Assistant asked:\n- Is it a side or a meal?',
        '',
        'User: A meal',
        '',
        'Assistant asked:\n1. Which protein?\n   Choices: Egg; Bacon',
        '',
        'User: 1. Egg',
        '',
        'Assistant: Egg it is. How crispy?',
        '',
        '## Your last question',
        '',
        '1. How crispy?',
      ].join('\n'),
    );
    expect(text).toMatch(/## My answer\n\n1\. Very$/);
    expect(messageCount).toBe(6);
  });

  it('keeps an answered question whose verdict was not recognised', () => {
    // The open request is a tool approval; an earlier question was answered
    // in a wording the timeline did not read, so its verdict is missing.
    const { text } = buildContinuationPrompt({
      items: [user('Hi'), asked(['Which protein?']), user('Egg')],
      pendingQuestions: [],
    });

    expect(text).toContain('Assistant asked:\n- Which protein?');
  });

  it('does not promise an answer it does not carry', () => {
    const { text } = buildContinuationPrompt({
      items: conversation,
      pendingQuestions,
    });

    expect(text).toContain(
      'It ends with the question you asked last, which I have not answered.',
    );
    expect(text).not.toContain('my answer to it');
    expect(text).not.toContain('## My answer');
  });

  it('stays within the limit when the questions alone are too long', () => {
    const maxLength = 6_000;
    const { text } = buildContinuationPrompt({
      items: conversation,
      pendingQuestions: [
        {
          question: 'q'.repeat(9_000),
          choices: ['c'.repeat(9_000)],
          multiple: false,
        },
        { question: 'r'.repeat(9_000), multiple: false },
      ],
      maxLength,
    });

    expect(text.length).toBeLessThanOrEqual(maxLength);
    expect(text).toContain('## Your last question');
  });

  it('keeps the conversation as counted when a short reply replaces the answer', () => {
    const items = Array.from({ length: 60 }, (_, index) =>
      user(`message ${index} ${'y'.repeat(300)}`),
    );
    const counted = buildContinuationPrompt({
      items,
      pendingQuestions,
      answers: [['Egg']],
      maxLength: 12_000,
    });
    const typed = buildContinuationPrompt({
      items,
      pendingQuestions,
      answers: [['Egg']],
      reply: 'z'.repeat(3_000),
      maxLength: 12_000,
    });

    expect(counted.includedMessageCount).toBeLessThan(60);
    expect(typed.includedMessageCount).toBe(counted.includedMessageCount);
  });
});

describe('readContinuationMarker', () => {
  it('reads the marker only at the very start of the text', () => {
    expect(
      readContinuationMarker('[Continues session lab/abc]\nHello'),
    ).toEqual({ installation: 'lab', sessionId: 'abc', rest: 'Hello' });
    expect(
      readContinuationMarker('Hello\n[Continues session lab/abc]\n'),
    ).toBeUndefined();
    expect(
      readContinuationMarker(' [Continues session lab/abc]\nHello'),
    ).toBeUndefined();
    // A line of its own: the same words inside a sentence stay text.
    expect(
      readContinuationMarker('[Continues session lab/abc] and more'),
    ).toBeUndefined();
  });
});

describe('splitContinuation', () => {
  it('takes the marker out of the session’s first user message', () => {
    const items = [
      user('[Continues session lab/abc]\n\nI am continuing a session'),
      agent('Carrying on.'),
    ];

    const { items: shown, continues } = splitContinuation(items);

    expect(continues).toEqual({ installation: 'lab', sessionId: 'abc' });
    expect(shown[0]).toMatchObject({
      kind: 'user-message',
      text: 'I am continuing a session',
    });
    expect(shown[1]).toBe(items[1]);
  });

  it('leaves a marker in any later message alone', () => {
    const items = [
      user('Hello'),
      user('[Continues session lab/abc]\n\nNot the first message'),
    ];

    const { items: shown, continues } = splitContinuation(items);

    expect(continues).toBeUndefined();
    expect(shown).toBe(items);
  });
});
