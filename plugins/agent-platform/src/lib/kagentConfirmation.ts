import {
  ASK_USER_TOOL_NAME,
  CONFIRMATION_TOOL_NAME,
  isFunctionCallPart,
  parsePart,
  readFunctionCall,
  readProposedCall,
} from '@giantswarm/backstage-plugin-agent-platform-common';
/**
 * The runtime's hints on the confirmation requests in a message that render as
 * an approval or a question.
 *
 * The hint ("Please approve or reject the tool call call_tool() by responding
 * with a FunctionResponse…") is an instruction to an API client, and the v1
 * runtime also sends it as the message's text. The card says what is asked,
 * so the hint is left out of the agent's prose, except next to a question the
 * card cannot read, where it is the only readable text left.
 */
export function readConfirmationHints(parts: unknown[]): string[] {
  const hints: string[] = [];
  for (const rawPart of parts) {
    const part = parsePart(rawPart);
    if (!part || !isFunctionCallPart(part)) {
      continue;
    }
    const call = readFunctionCall(part);
    if (call.name !== CONFIRMATION_TOOL_NAME) {
      continue;
    }
    const proposed = readProposedCall(call.args);
    const hint = proposed?.hint?.trim();
    if (!hint) {
      continue;
    }
    const readable =
      proposed?.name === ASK_USER_TOOL_NAME
        ? readAskUserQuestions(proposed.args).length > 0
        : Boolean(proposed?.name);
    if (readable) {
      hints.push(hint);
    }
  }
  return hints;
}

/** Agent prose with a runtime hint removed, whole or at its end. */
export function withoutHints(text: string, hints: string[]): string {
  return hints.reduce(
    (rest, hint) =>
      rest.endsWith(hint) ? rest.slice(0, -hint.length).trimEnd() : rest,
    text,
  );
}

/**
 * The questions an `ask_user` call is putting to the user.
 *
 * Shape on the wire, from a live session on an internal installation:
 * `args: { questions: [{ question: "…" }] }` — one entry per question, and a real
 * `ask_user` can ask several at once.
 *
 * Anything that doesn't match is skipped rather than coerced: a question rendered
 * from a guessed field would put words in the agent's mouth, and the raw args are
 * still shown when nothing here matches.
 */
export function readAskUserQuestions(args: unknown): string[] {
  if (!args || typeof args !== 'object') {
    return [];
  }
  const { questions } = args as { questions?: unknown };
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions
    .map(entry => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (entry && typeof entry === 'object') {
        const { question } = entry as { question?: unknown };
        return typeof question === 'string' ? question : undefined;
      }
      return undefined;
    })
    .filter((text): text is string => Boolean(text && text.trim()));
}
