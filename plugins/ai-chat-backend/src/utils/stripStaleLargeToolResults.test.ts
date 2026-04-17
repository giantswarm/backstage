import { ModelMessage } from 'ai';
import { stripStaleLargeToolResults } from './stripStaleLargeToolResults';

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

describe('stripStaleLargeToolResults', () => {
  const largePayload = 'x'.repeat(5000);

  it('strips older results for a targeted tool but keeps the most recent', () => {
    const messages: ModelMessage[] = [
      userText('hi'),
      assistantToolCall('id-1', 'list_tools'),
      toolResult('id-1', 'list_tools', largePayload),
      userText('another question'),
      assistantToolCall('id-2', 'list_tools'),
      toolResult('id-2', 'list_tools', largePayload),
    ];

    const { messages: out, stats } = stripStaleLargeToolResults(messages, {
      toolNames: ['list_tools'],
    });

    const firstResult = out[2] as any;
    const secondResult = out[5] as any;

    expect(firstResult.content[0].output.value).toMatch(
      /^\[Tool result removed/,
    );
    expect(secondResult.content[0].output.value).toBe(largePayload);

    expect(stats.strippedCount).toBe(1);
    expect(stats.approxBytesSaved).toBeGreaterThan(4000);
  });

  it('strips every occurrence when keepMostRecent is false', () => {
    const messages: ModelMessage[] = [
      assistantToolCall('id-1', 'list_tools'),
      toolResult('id-1', 'list_tools', largePayload),
      assistantToolCall('id-2', 'list_tools'),
      toolResult('id-2', 'list_tools', largePayload),
    ];

    const { stats } = stripStaleLargeToolResults(messages, {
      toolNames: ['list_tools'],
      keepMostRecent: false,
    });

    expect(stats.strippedCount).toBe(2);
  });

  it('leaves non-targeted tool results untouched', () => {
    const messages: ModelMessage[] = [
      assistantToolCall('id-1', 'some_other_tool'),
      toolResult('id-1', 'some_other_tool', largePayload),
      assistantToolCall('id-2', 'list_tools'),
      toolResult('id-2', 'list_tools', largePayload),
      assistantToolCall('id-3', 'list_tools'),
      toolResult('id-3', 'list_tools', largePayload),
    ];

    const { messages: out, stats } = stripStaleLargeToolResults(messages, {
      toolNames: ['list_tools'],
    });

    const otherToolResult = out[1] as any;
    expect(otherToolResult.content[0].output.value).toBe(largePayload);
    expect(stats.strippedCount).toBe(1);
  });

  it('preserves tool-call in the assistant message when a result is stripped', () => {
    const messages: ModelMessage[] = [
      assistantToolCall('id-1', 'list_tools'),
      toolResult('id-1', 'list_tools', largePayload),
      assistantToolCall('id-2', 'list_tools'),
      toolResult('id-2', 'list_tools', largePayload),
    ];

    const { messages: out } = stripStaleLargeToolResults(messages, {
      toolNames: ['list_tools'],
    });

    const assistant = out[0] as any;
    expect(assistant.role).toBe('assistant');
    expect(assistant.content[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'id-1',
      toolName: 'list_tools',
    });
  });

  it('preserves toolCallId and toolName on the stripped result', () => {
    const messages: ModelMessage[] = [
      assistantToolCall('id-1', 'list_tools'),
      toolResult('id-1', 'list_tools', largePayload),
      assistantToolCall('id-2', 'list_tools'),
      toolResult('id-2', 'list_tools', largePayload),
    ];

    const { messages: out } = stripStaleLargeToolResults(messages, {
      toolNames: ['list_tools'],
    });

    const stripped = (out[1] as any).content[0];
    expect(stripped.type).toBe('tool-result');
    expect(stripped.toolCallId).toBe('id-1');
    expect(stripped.toolName).toBe('list_tools');
  });

  it('returns empty stats and the same array when toolNames is empty', () => {
    const messages: ModelMessage[] = [
      assistantToolCall('id-1', 'list_tools'),
      toolResult('id-1', 'list_tools', largePayload),
    ];

    const { messages: out, stats } = stripStaleLargeToolResults(messages, {
      toolNames: [],
    });

    expect(out).toBe(messages);
    expect(stats).toEqual({ strippedCount: 0, approxBytesSaved: 0 });
  });

  it('is a no-op when no messages match a targeted tool', () => {
    const messages: ModelMessage[] = [
      userText('hi'),
      assistantToolCall('id-1', 'some_other_tool'),
      toolResult('id-1', 'some_other_tool', largePayload),
    ];

    const { messages: out, stats } = stripStaleLargeToolResults(messages, {
      toolNames: ['list_tools'],
    });

    expect(stats.strippedCount).toBe(0);
    expect(out[2]).toBe(messages[2]);
  });
});
