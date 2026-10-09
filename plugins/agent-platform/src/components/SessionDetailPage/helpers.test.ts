import { TimelineItem } from '../../lib/kagentTimeline';
import { createPolledPairing, fresherStreamedCopy } from './helpers';

describe('fresherStreamedCopy', () => {
  const call = (
    id: string,
    fields: { isPending: boolean; result?: unknown },
  ): TimelineItem => ({
    kind: 'tool-call',
    id,
    taskIndex: 0,
    messageId: 'art-call',
    toolName: 'kubectl_get',
    ...fields,
  });
  const reply = (id: string, text: string): TimelineItem => ({
    kind: 'agent-message',
    id,
    taskIndex: 0,
    messageId: 'art-reply',
    text,
  });

  it('carries a streamed result into a call the poll saw still running', () => {
    expect(
      fresherStreamedCopy(
        call('polled', { isPending: true }),
        call('stream:0', { isPending: false, result: { output: 'ok' } }),
      ),
    ).toEqual(call('polled', { isPending: false, result: { output: 'ok' } }));
  });

  it('keeps a polled call that is as far along', () => {
    expect(
      fresherStreamedCopy(
        call('polled', { isPending: false, result: 'stored' }),
        call('stream:0', { isPending: false, result: 'streamed' }),
      ),
    ).toBeUndefined();
    expect(
      fresherStreamedCopy(
        call('polled', { isPending: true }),
        call('stream:0', { isPending: true }),
      ),
    ).toBeUndefined();
  });

  it('carries the rest of a reply the poll read cut off', () => {
    expect(
      fresherStreamedCopy(reply('polled', 'Do'), reply('stream:0', 'Done.')),
    ).toEqual(reply('polled', 'Done.'));
  });

  it('keeps a polled reply that is as long', () => {
    expect(
      fresherStreamedCopy(reply('polled', 'Done.'), reply('stream:0', 'Done.')),
    ).toBeUndefined();
  });

  it('leaves a longer text that does not continue the polled one alone', () => {
    // Text either side of a call shares one messageId: the second paragraph
    // must not take the first one's place for being longer.
    expect(
      fresherStreamedCopy(
        reply('polled', 'Checking.'),
        reply('stream:2', 'All nodes are ready.'),
      ),
    ).toBeUndefined();
  });

  it("carries a delegated agent's usage with its result", () => {
    const delegation = (fields: {
      isPending: boolean;
      result?: unknown;
    }): TimelineItem => ({
      kind: 'agent-call',
      id: 'polled',
      taskIndex: 0,
      messageId: 'art-call',
      agentId: 'kagent__NS__sre_agent',
      ...fields,
    });
    const result = {
      result: 'done',
      usage: { promptTokenCount: 10, candidatesTokenCount: 5 },
    };

    expect(
      fresherStreamedCopy(
        delegation({ isPending: true }),
        delegation({ isPending: false, result }),
      ),
    ).toEqual(
      expect.objectContaining({
        isPending: false,
        result,
        tokens: expect.objectContaining({ prompt: 10, completion: 5 }),
      }),
    );
  });

  it('leaves items of different kinds alone', () => {
    expect(
      fresherStreamedCopy(reply('polled', 'Do'), {
        kind: 'reasoning',
        id: 'stream:0',
        taskIndex: 0,
        messageId: 'art-reply',
        text: 'Done.',
      }),
    ).toBeUndefined();
  });
});

describe('createPolledPairing', () => {
  const item = (
    kind: 'agent-message' | 'tool-call',
    id: string,
    messageId?: string,
  ): TimelineItem =>
    kind === 'tool-call'
      ? { kind, id, taskIndex: 0, messageId, toolName: 't', isPending: true }
      : { kind, id, taskIndex: 0, messageId, text: id };

  it('pairs items of one message by their position within it', () => {
    // Text, a call, more text, and a second call made in parallel — all one
    // message.
    const pair = createPolledPairing([
      item('agent-message', 'earlier', 'm-0'),
      item('agent-message', 'text-1', 'm-1'),
      item('tool-call', 'call-1', 'm-1'),
      item('tool-call', 'call-2', 'm-1'),
      item('agent-message', 'text-2', 'm-1'),
    ]);

    expect(pair({ kind: 'agent-message', messageId: 'm-1' })).toBe(1);
    expect(pair({ kind: 'tool-call', messageId: 'm-1' })).toBe(2);
    expect(pair({ kind: 'tool-call', messageId: 'm-1' })).toBe(3);
    expect(pair({ kind: 'agent-message', messageId: 'm-1' })).toBe(4);
  });

  it('pairs nothing the read had not reached yet', () => {
    const pair = createPolledPairing([item('agent-message', 'text-1', 'm-1')]);

    expect(pair({ kind: 'agent-message', messageId: 'm-1' })).toBe(0);
    expect(pair({ kind: 'tool-call', messageId: 'm-1' })).toBeUndefined();
    expect(pair({ kind: 'agent-message', messageId: 'm-1' })).toBeUndefined();
    expect(pair({ kind: 'agent-message', messageId: 'm-2' })).toBeUndefined();
    expect(pair({ kind: 'agent-message' })).toBeUndefined();
  });
});
