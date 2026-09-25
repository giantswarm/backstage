import { formatCount } from './formatNumbers';

/**
 * The agent chart and agent-manager refuse a longer system prompt: the
 * compiled agent config has to fit Substrate's 32768-character env value limit.
 */
export const MAX_SYSTEM_MESSAGE_LENGTH = 20000;

/**
 * Characters as the chart schema and agent-manager count them: code points,
 * not the UTF-16 units `String.length` counts.
 */
export function characterCount(value: string): number {
  return [...value].length;
}

/** Why the system prompt cannot be saved, or undefined when it can. */
export function systemMessageProblem(value: string): string | undefined {
  const count = characterCount(value);
  if (count <= MAX_SYSTEM_MESSAGE_LENGTH) {
    return undefined;
  }
  return `System prompt is ${formatCount(count)} characters; the limit is ${formatCount(
    MAX_SYSTEM_MESSAGE_LENGTH,
  )}. Move long reference material into a skill`;
}
