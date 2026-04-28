import { ModelMessage } from 'ai';
import { pruneOldToolResults } from './pruneOldToolResults';

function assistantToolCall(toolCallId: string, toolName: string): ModelMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId,
        toolName,
        input: {},
      },
    ],
  };
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

function userText(text: string): ModelMessage {
  return { role: 'user', content: text };
}

function assistantText(text: string): ModelMessage {
  return { role: 'assistant', content: text };
}

// 1 token ≈ 4 chars, so 200_000 chars ≈ 50_000 tokens.
const HUGE = 'x'.repeat(200_000);
// 1 token ≈ 4 chars, so 60_000 chars ≈ 15_000 tokens.
const MEDIUM = 'x'.repeat(60_000);
// 1 token ≈ 4 chars, so 4_000 chars ≈ 1_000 tokens.
const SMALL = 'x'.repeat(4_000);

describe('pruneOldToolResults', () => {
  it('protects the last two user turns entirely', () => {
    // Pruning kicks in only from the third-most-recent user turn back.
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantToolCall('id-1', 'k_get'),
      toolResult('id-1', 'k_get', HUGE), // turn 1 — eligible
      userText('q2'),
      assistantToolCall('id-2', 'k_get'),
      toolResult('id-2', 'k_get', HUGE), // turn 2 — protected
      userText('q3'),
      assistantToolCall('id-3', 'k_get'),
      toolResult('id-3', 'k_get', HUGE), // turn 3 (current) — protected
    ];

    const { messages: out, stats } = pruneOldToolResults(messages, {
      reservedTokens: 1_000,
      minimumSavingsTokens: 1_000,
    });

    // Two most recent turns: untouched.
    expect((out[8] as any).content[0].output.value).toBe(HUGE);
    expect((out[5] as any).content[0].output.value).toBe(HUGE);
    // Oldest turn: pruned, since its 50k tokens blow past the 1k budget.
    expect((out[2] as any).content[0].output.value).toBe(
      '[Old tool result content cleared]',
    );
    expect(stats.prunedCount).toBe(1);
  });

  it('keeps tool results within reservedTokens of the most recent', () => {
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantToolCall('id-1', 'k_get'),
      toolResult('id-1', 'k_get', HUGE), // ~50k — outside 40k budget
      userText('q2'),
      assistantToolCall('id-2', 'k_get'),
      toolResult('id-2', 'k_get', MEDIUM), // ~15k — inside 40k budget
      userText('q3'),
      assistantToolCall('id-3', 'k_get'),
      toolResult('id-3', 'k_get', SMALL), // current — protected
      userText('q4'),
      assistantText('answer'), // current — protected
    ];

    const { messages: out } = pruneOldToolResults(messages, {
      reservedTokens: 40_000,
      minimumSavingsTokens: 1_000,
    });

    expect((out[8] as any).content[0].output.value).toBe(SMALL); // protected window
    expect((out[5] as any).content[0].output.value).toBe(MEDIUM); // within budget
    expect((out[2] as any).content[0].output.value).toBe(
      '[Old tool result content cleared]',
    );
  });

  it('does nothing if savings are below minimumSavingsTokens', () => {
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantToolCall('id-1', 'k_get'),
      toolResult('id-1', 'k_get', SMALL), // ~1k tokens — eligible but tiny
      userText('q2'),
      assistantToolCall('id-2', 'k_get'),
      toolResult('id-2', 'k_get', SMALL),
      userText('q3'),
      assistantText('answer'),
    ];

    const { messages: out, stats } = pruneOldToolResults(messages, {
      reservedTokens: 0, // everything past protected window is prunable…
      minimumSavingsTokens: 100_000, // …but only if savings ≥ 100k tokens
    });

    expect(out).toBe(messages);
    expect(stats.prunedCount).toBe(0);
    // Near-miss reporting: prunable count is still surfaced so the caller
    // can log that something was eligible but held back by the gate.
    expect(stats.prunableTokens).toBeGreaterThan(0);
  });

  it('never prunes results from protectedTools', () => {
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantToolCall('id-1', 'getSkill'),
      toolResult('id-1', 'getSkill', HUGE),
      assistantToolCall('id-2', 'k_get'),
      toolResult('id-2', 'k_get', HUGE),
      userText('q2'),
      assistantText('answer 2'),
      userText('q3'),
      assistantText('answer 3'),
    ];

    const { messages: out, stats } = pruneOldToolResults(messages, {
      reservedTokens: 1_000,
      minimumSavingsTokens: 1_000,
      protectedTools: ['getSkill'],
    });

    // getSkill survives unchanged.
    expect((out[2] as any).content[0].output.value).toBe(HUGE);
    // Other tool result gets pruned.
    expect((out[4] as any).content[0].output.value).toBe(
      '[Old tool result content cleared]',
    );
    expect(stats.prunedCount).toBe(1);
  });

  it('preserves toolCallId, toolName, and assistant tool-call on pruned parts', () => {
    const messages: ModelMessage[] = [
      userText('q1'),
      assistantToolCall('id-1', 'k_get'),
      toolResult('id-1', 'k_get', HUGE),
      userText('q2'),
      assistantText('answer 2'),
      userText('q3'),
      assistantText('answer 3'),
    ];

    const { messages: out } = pruneOldToolResults(messages, {
      reservedTokens: 1_000,
      minimumSavingsTokens: 1_000,
    });

    const stripped = (out[2] as any).content[0];
    expect(stripped.type).toBe('tool-result');
    expect(stripped.toolCallId).toBe('id-1');
    expect(stripped.toolName).toBe('k_get');

    // Assistant tool-call message untouched.
    expect((out[1] as any).content[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'id-1',
      toolName: 'k_get',
    });
  });

  it('returns identical messages when there is only one user turn', () => {
    const messages: ModelMessage[] = [
      userText('only turn'),
      assistantToolCall('id-1', 'k_get'),
      toolResult('id-1', 'k_get', HUGE),
    ];

    const { messages: out, stats } = pruneOldToolResults(messages, {
      reservedTokens: 1_000,
      minimumSavingsTokens: 1_000,
    });

    expect(out).toBe(messages);
    expect(stats.prunedCount).toBe(0);
  });
});
