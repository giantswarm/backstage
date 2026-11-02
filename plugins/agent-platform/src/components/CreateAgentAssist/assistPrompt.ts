import type { NewAgentFormState } from '../NewAgentFormProvider';

/**
 * The prompt the assist session opens with, prefilled and editable — the
 * create-agent context the agent-management agent needs to help, same pattern
 * as the Evaluate flow's `evaluationPrompt`.
 *
 * The fenced-block instruction is load-bearing: kagent replies are plain
 * markdown, so a fenced block is the only container the panel can recognise a
 * proposed system prompt in (see `extractFencedBlocks`).
 */
export function assistOpeningPrompt(
  form: Pick<NewAgentFormState, 'name' | 'description' | 'systemMessage'>,
): string {
  const lines = [
    'I am creating a new agent in the Agent Platform and would like your help drafting it.',
    `So far the form says — name: ${
      form.name.trim() ? `"${form.name.trim()}"` : 'not set yet'
    }; description: ${
      form.description.trim() ? `"${form.description.trim()}"` : 'not set yet'
    }.`,
  ];
  if (form.systemMessage.trim()) {
    lines.push(
      'The system prompt I have so far:',
      '```',
      form.systemMessage.trim(),
      '```',
    );
  }
  lines.push(
    'Please propose a system prompt (instructions) for this agent, and suggest which skills or tools would fit.',
    'Put any proposed system prompt in a fenced code block of its own, so I can copy it into the form.',
  );
  return lines.join('\n');
}
