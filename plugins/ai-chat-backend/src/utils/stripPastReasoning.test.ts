import { ModelMessage } from 'ai';
import { stripPastReasoning } from './stripPastReasoning';

function userText(text: string): ModelMessage {
  return { role: 'user', content: text };
}

function assistantWith(
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; input: any }
  >,
): ModelMessage {
  return { role: 'assistant', content: parts as any };
}

function toolResult(
  toolCallId: string,
  toolName: string,
  text: string,
): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName,
        output: { type: 'text', value: text },
      },
    ],
  };
}

describe('stripPastReasoning', () => {
  it('protects the last two user turns entirely', () => {
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantWith([
        { type: 'reasoning', text: 'think 1' },
        { type: 'text', text: 'answer 1' },
      ]),
      userText('q2'),
      assistantWith([
        { type: 'reasoning', text: 'think 2' },
        { type: 'text', text: 'answer 2' },
      ]),
      userText('q3'),
      assistantWith([
        { type: 'reasoning', text: 'think 3' },
        { type: 'text', text: 'answer 3' },
      ]),
    ];

    const { messages: out, stats } = stripPastReasoning(messages);

    // Turn 3 (current) and turn 2 (one back): reasoning kept.
    expect((out[5] as any).content).toEqual([
      { type: 'reasoning', text: 'think 3' },
      { type: 'text', text: 'answer 3' },
    ]);
    expect((out[3] as any).content).toEqual([
      { type: 'reasoning', text: 'think 2' },
      { type: 'text', text: 'answer 2' },
    ]);
    // Turn 1: reasoning stripped, text retained.
    expect((out[1] as any).content).toEqual([
      { type: 'text', text: 'answer 1' },
    ]);
    expect(stats.strippedCount).toBe(1);
    expect(stats.approxTokensSaved).toBeGreaterThan(0);
  });

  it('strips reasoning across multi-step assistant blocks within an old turn', () => {
    // A turn with a tool call splits into multiple ModelMessage assistant
    // blocks, each potentially carrying its own reasoning part.
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantWith([
        { type: 'reasoning', text: 'pre-tool think' },
        { type: 'tool-call', toolCallId: 'id-1', toolName: 'k_get', input: {} },
      ]),
      toolResult('id-1', 'k_get', 'tool output'),
      assistantWith([
        { type: 'reasoning', text: 'post-tool think' },
        { type: 'text', text: 'final answer 1' },
      ]),
      userText('q2'),
      assistantWith([{ type: 'text', text: 'answer 2' }]),
      userText('q3'),
      assistantWith([{ type: 'text', text: 'answer 3' }]),
    ];

    const { messages: out, stats } = stripPastReasoning(messages);

    // Both old assistant blocks have reasoning stripped.
    expect((out[1] as any).content).toEqual([
      { type: 'tool-call', toolCallId: 'id-1', toolName: 'k_get', input: {} },
    ]);
    expect((out[3] as any).content).toEqual([
      { type: 'text', text: 'final answer 1' },
    ]);
    expect(stats.strippedCount).toBe(2);
  });

  it('preserves tool-call parts and message order when reasoning is removed', () => {
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantWith([
        { type: 'reasoning', text: 'think' },
        { type: 'tool-call', toolCallId: 'id-1', toolName: 'k_get', input: {} },
      ]),
      toolResult('id-1', 'k_get', 'output'),
      userText('q2'),
      assistantWith([{ type: 'text', text: 'answer 2' }]),
      userText('q3'),
      assistantWith([{ type: 'text', text: 'answer 3' }]),
    ];

    const { messages: out } = stripPastReasoning(messages);

    expect(out).toHaveLength(messages.length);
    expect((out[1] as any).content).toEqual([
      { type: 'tool-call', toolCallId: 'id-1', toolName: 'k_get', input: {} },
    ]);
    // Tool result message untouched.
    expect(out[2]).toBe(messages[2]);
  });

  it('preserves reasoning in an in-progress tool-loop in the most recent turn', () => {
    // Frontend auto-send fires while the assistant is mid-loop: the last
    // message is a `tool` result, the prior `assistant` carries a reasoning
    // block tied to the pending tool_use. Anthropic requires that block to
    // round-trip with the next request — it must not be stripped.
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantWith([
        { type: 'reasoning', text: 'old think' },
        { type: 'text', text: 'old answer' },
      ]),
      userText('q2'),
      assistantWith([
        { type: 'reasoning', text: 'mid think' },
        { type: 'text', text: 'mid answer' },
      ]),
      userText('q3'),
      // In-progress tool loop in the current turn:
      assistantWith([
        { type: 'reasoning', text: 'active think' },
        { type: 'tool-call', toolCallId: 'id-1', toolName: 'k_get', input: {} },
      ]),
      toolResult('id-1', 'k_get', 'tool output'),
    ];

    const { messages: out, stats } = stripPastReasoning(messages);

    // Oldest turn: reasoning stripped.
    expect((out[1] as any).content).toEqual([
      { type: 'text', text: 'old answer' },
    ]);
    // One-back turn (still protected): reasoning kept.
    expect((out[3] as any).content).toContainEqual({
      type: 'reasoning',
      text: 'mid think',
    });
    // In-progress tool-loop: reasoning preserved.
    expect((out[5] as any).content).toContainEqual({
      type: 'reasoning',
      text: 'active think',
    });
    expect(stats.strippedCount).toBe(1);
  });

  it('returns identical reference when there is only one user turn', () => {
    const messages: ModelMessage[] = [
      userText('only turn'),
      assistantWith([
        { type: 'reasoning', text: 'think' },
        { type: 'text', text: 'answer' },
      ]),
    ];

    const { messages: out, stats } = stripPastReasoning(messages);

    expect(out).toBe(messages);
    expect(stats.strippedCount).toBe(0);
    expect(stats.approxTokensSaved).toBe(0);
  });

  it('returns identical reference when there are no reasoning parts', () => {
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantWith([{ type: 'text', text: 'answer 1' }]),
      userText('q2'),
      assistantWith([{ type: 'text', text: 'answer 2' }]),
      userText('q3'),
      assistantWith([{ type: 'text', text: 'answer 3' }]),
    ];

    const { messages: out, stats } = stripPastReasoning(messages);

    expect(out).toBe(messages);
    expect(stats.strippedCount).toBe(0);
  });

  it('leaves string-content assistant messages untouched', () => {
    const messages: ModelMessage[] = [
      userText('q1'),
      { role: 'assistant', content: 'string answer 1' },
      userText('q2'),
      assistantWith([{ type: 'text', text: 'answer 2' }]),
      userText('q3'),
      assistantWith([{ type: 'text', text: 'answer 3' }]),
    ];

    const { messages: out, stats } = stripPastReasoning(messages);

    expect(out).toBe(messages);
    expect(stats.strippedCount).toBe(0);
  });
});
