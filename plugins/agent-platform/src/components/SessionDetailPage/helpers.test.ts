import { TimelineItem } from '../../lib/kagentTimeline';
import { fresherStreamedCopy } from './helpers';

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
