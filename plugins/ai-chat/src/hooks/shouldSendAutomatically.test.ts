import type { UIMessage } from 'ai';
import { shouldSendAutomatically } from './shouldSendAutomatically';

function assistantWith(...outputs: unknown[]): UIMessage[] {
  return [
    { id: 'u', role: 'user', parts: [{ type: 'text', text: 'Who am I?' }] },
    {
      id: 'a',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        ...outputs.map((output, i) => ({
          type: 'dynamic-tool' as const,
          toolName: 'call_tool',
          toolCallId: `c${i}`,
          state: 'output-available' as const,
          input: {},
          output,
        })),
      ],
    },
  ];
}

const signIn = {
  content: [],
  isError: true,
  inputRequired: {
    tool: 'x_github_get_me',
    arguments: {},
    elicitations: [{ key: 'k', url: 'https://dex.example.io', message: '' }],
  },
};

describe('shouldSendAutomatically', () => {
  it('sends once every tool call of the last step has its output', () => {
    expect(
      shouldSendAutomatically({ messages: assistantWith({ content: [] }) }),
    ).toBe(true);
  });

  it('waits while a call of the last step waits for the person to sign in', () => {
    expect(
      shouldSendAutomatically({
        messages: assistantWith({ content: [] }, signIn),
      }),
    ).toBe(false);
  });
});
