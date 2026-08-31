import {
  ASK_USER_TOOL_NAME,
  CONFIRMATION_TOOL_NAME,
  parsePart,
} from './kagentParts';
import { A2aTaskWire } from './kagentTaskSchema';
import {
  AWAITING_INPUT_STATES,
  findNewestStatefulTaskIndex,
} from './kagentSessionState';

/**
 * One question an `ask_user` call is putting to the user.
 *
 * `choices` absent means free text — both shapes occur in practice on the same
 * installation, so the answer UI has to handle both rather than assuming one.
 */
export type AskUserQuestion = {
  question: string;
  /** Offered options. Absent or empty means answer in free text. */
  choices?: string[];
  /** Whether more than one choice may be selected. */
  multiple: boolean;
};

/**
 * A confirmation the agent is waiting on, ready to be answered.
 *
 * `taskId` is the whole reason this exists as its own reader rather than being
 * folded into the timeline: answering has to name the task it resumes, and a
 * timeline item only knows its *index*. See {@link readPendingConfirmation}.
 */
export type PendingConfirmation = {
  /** The `input-required` task's own id — what an answer must carry as `taskId`. */
  taskId: string;
  /**
   * What is being asked. `'input'` is a question put through `ask_user`;
   * `'approval'` is "may I run this tool", which takes a yes/no rather than an
   * answer. ADK wraps both in the same confirmation request.
   */
  asks: 'input' | 'approval';
  /** The tool the agent proposed to run, for an `'approval'`. */
  toolName?: string;
  /** The questions, for an `'input'`. Empty for an approval. */
  questions: AskUserQuestion[];
};

/** The `questions` array out of an `ask_user` call's arguments. */
function readQuestions(args: unknown): AskUserQuestion[] {
  if (!args || typeof args !== 'object') {
    return [];
  }
  const { questions } = args as { questions?: unknown };
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions
    .map((entry): AskUserQuestion | undefined => {
      // A bare string is accepted because `readAskUserQuestions` in the timeline
      // already tolerates one; the two readers must agree on what counts as a
      // question or the UI would offer an answer box for something the timeline
      // does not show, or the reverse.
      if (typeof entry === 'string') {
        return entry.trim() ? { question: entry, multiple: false } : undefined;
      }
      if (!entry || typeof entry !== 'object') {
        return undefined;
      }
      const record = entry as {
        question?: unknown;
        choices?: unknown;
        multiple?: unknown;
      };
      if (typeof record.question !== 'string' || !record.question.trim()) {
        return undefined;
      }

      const choices = Array.isArray(record.choices)
        ? record.choices.filter(
            (choice): choice is string =>
              typeof choice === 'string' && choice !== '',
          )
        : undefined;

      return {
        question: record.question,
        // Absent rather than empty, so "free text" is one condition to check.
        ...(choices && choices.length > 0 && { choices }),
        multiple: record.multiple === true,
      };
    })
    .filter((question): question is AskUserQuestion => Boolean(question));
}

/**
 * The confirmation this session is waiting on, if any.
 *
 * Read from the **newest** task whose state awaits input, and only from
 * `status.message` — not from `history`. That is deliberate and not
 * interchangeable: a confirmation request appears in history as an ordinary
 * long-running function call, which stays there for the rest of the session even
 * after it has been answered. `status.message` carries it only while the task is
 * actually suspended, so reading it is what makes "still pending" true rather than
 * merely "was once asked".
 *
 * Returns `undefined` for a session that is not waiting, and for one that is
 * waiting on something we cannot read — a confirmation whose payload has a shape
 * we do not recognise must not produce an answer box that submits a guess.
 */
export function readPendingConfirmation(
  tasks: A2aTaskWire[],
): PendingConfirmation | undefined {
  // The task whose state *is* the session's state — the same one the badge and the
  // working indicator read. Emphatically not "the newest task that awaits input":
  // klaus-gateway's Slack answers leave every question they answer suspended, so a
  // healthy session routinely holds several stranded `input-required` tasks behind a
  // newest task that has completed. Searching for one of those offered to answer a
  // question the agent had already moved past.
  const index = findNewestStatefulTaskIndex(tasks);
  if (index === undefined) {
    return undefined;
  }

  const task = tasks[index];
  const state = task.status?.state;
  if (typeof state !== 'string' || !AWAITING_INPUT_STATES.has(state)) {
    return undefined;
  }

  {
    const taskId = task.id;
    if (typeof taskId !== 'string' || !taskId) {
      // Without the task's id an answer cannot name what it resumes, and a
      // taskless answer opens a *new* task while leaving this one suspended
      // forever. Better to offer nothing.
      return undefined;
    }

    // `status.message` is `z.unknown()` on the wire schema — nothing read it
    // before this, and it is untrusted, so narrow it here rather than assuming a
    // shape the parser never promised.
    const statusMessage = task.status?.message;
    const parts =
      statusMessage && typeof statusMessage === 'object'
        ? (statusMessage as { parts?: unknown }).parts
        : undefined;
    if (!Array.isArray(parts)) {
      return undefined;
    }

    for (const rawPart of parts) {
      const part = parsePart(rawPart);
      const data = part?.data;
      if (!data || typeof data !== 'object') {
        continue;
      }
      const record = data as { name?: unknown; args?: unknown };
      if (record.name !== CONFIRMATION_TOOL_NAME) {
        continue;
      }

      const proposed = (record.args as { originalFunctionCall?: unknown })
        ?.originalFunctionCall;
      const proposedRecord =
        proposed && typeof proposed === 'object'
          ? (proposed as { name?: unknown; args?: unknown })
          : undefined;
      const toolName =
        typeof proposedRecord?.name === 'string'
          ? proposedRecord.name
          : undefined;
      const isQuestion = toolName === ASK_USER_TOOL_NAME;

      return {
        taskId,
        asks: isQuestion ? 'input' : 'approval',
        toolName,
        questions: isQuestion ? readQuestions(proposedRecord?.args) : [],
      };
    }

    // The task is suspended but its request is unreadable. The caller says so
    // rather than offering a box that would submit a guess.
    return undefined;
  }
}
