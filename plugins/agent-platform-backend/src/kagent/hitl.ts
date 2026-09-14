import { InputError } from '@backstage/errors';
import type { JsonObject } from '@bufbuild/protobuf';
import type { Message, Task } from './gen/a2a_pb';

/**
 * kagent's human-in-the-loop A2A extension, as the line pins it
 * (`go/api/a2a/hitl.go`).
 *
 * HITL is **negotiated**: the client asks for the extension on every call
 * (gRPC metadata `a2a-extensions`), the harness activates it, and only then is a
 * suspended task's `status.message` a typed request rather than a bare hint. The
 * request and the reply both ride in the message's `metadata` under the
 * extension URI, with the URI named in `message.extensions`.
 */
export const HITL_EXTENSION_URI = 'https://kagent.dev/extensions/hitl/v1';

/** gRPC metadata key a2a-go reads the requested extensions from. */
export const A2A_EXTENSIONS_HEADER = 'a2a-extensions';

export const HITL_TYPE_TOOL_APPROVAL_REQUEST = 'tool_approval_request';
export const HITL_TYPE_ASK_USER_REQUEST = 'ask_user_request';
export const HITL_TYPE_TOOL_APPROVAL_RESPONSE = 'tool_approval_response';
export const HITL_TYPE_ASK_USER_RESPONSE = 'ask_user_response';

/** One tool invocation awaiting a decision. */
export type HitlTool = {
  id: string;
  call_id?: string;
  name?: string;
  args?: unknown;
};

/** The request a suspended task carries, decoded. */
export type HitlRequest =
  | {
      type: typeof HITL_TYPE_TOOL_APPROVAL_REQUEST;
      hint?: string;
      /** The tools the human decides on — the nested set when the request was propagated from a child agent. */
      tools: HitlTool[];
    }
  | {
      type: typeof HITL_TYPE_ASK_USER_REQUEST;
      /** Correlates the reply with the question; echoed back verbatim. */
      id: string;
      questions: {
        question?: string;
        choices?: string[];
        multiple?: boolean;
      }[];
    };

/** What the panel decided, as the browser sends it. */
export type HitlAnswer = {
  decision: 'approve' | 'reject';
  /** Positional, one entry per question. Empty for an approval. */
  answers?: string[][];
  rejectionReason?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The HITL payload of a message, when it declares the extension and carries
 * one. Read off the message's `metadata` bag, which protobuf-es already
 * represents as plain JSON.
 */
export function readHitlPayload(
  message: Message | undefined,
): Record<string, unknown> | undefined {
  if (!message || !message.extensions.includes(HITL_EXTENSION_URI)) {
    return undefined;
  }
  return asRecord(message.metadata?.[HITL_EXTENSION_URI]);
}

/**
 * The decision a task is suspended on, from its `status.message`. Undefined
 * when the task is not waiting on the extension — either because it is not
 * suspended or because HITL was not activated on the turn that suspended it.
 */
export function readHitlRequest(task: Task): HitlRequest | undefined {
  const payload = readHitlPayload(task.status?.message);
  if (!payload) {
    return undefined;
  }
  const type = asString(payload.type);

  if (type === HITL_TYPE_TOOL_APPROVAL_REQUEST) {
    // A request propagated from a child agent names the child's tools under
    // `nested`; those are the ones the controller validates a reply against.
    const nested = asRecord(payload.nested);
    const source = Array.isArray(nested?.tools) ? nested.tools : payload.tools;
    const tools: HitlTool[] = (Array.isArray(source) ? source : [])
      .map(asRecord)
      .filter((tool): tool is Record<string, unknown> => Boolean(tool))
      .map(tool => ({
        id: asString(tool.id) ?? '',
        call_id: asString(tool.call_id),
        name: asString(tool.name),
        args: tool.args,
      }))
      .filter(tool => tool.id);
    if (tools.length === 0) {
      return undefined;
    }
    return { type, hint: asString(payload.hint), tools };
  }

  if (type === HITL_TYPE_ASK_USER_REQUEST) {
    const id = asString(payload.id);
    if (!id) {
      return undefined;
    }
    const questions = (
      Array.isArray(payload.questions) ? payload.questions : []
    ).map(entry => {
      const record = asRecord(entry) ?? {};
      return {
        question: asString(record.question),
        choices: Array.isArray(record.choices)
          ? record.choices.filter(
              (choice): choice is string => typeof choice === 'string',
            )
          : undefined,
        multiple: record.multiple === true,
      };
    });
    return { type, id, questions };
  }

  return undefined;
}

/**
 * The reply payload for a pending request, from the panel's decision.
 *
 * The controller validates a reply strictly — every requested tool decided
 * exactly once, every question answered, the correlation id echoed — so the
 * payload is built from the *request kagent recorded*, never from anything the
 * browser claims about it. The browser only ever says approve/reject and, for a
 * question, the answers in the order asked.
 *
 * - A **tool approval** applies the one decision to every requested tool: one
 *   confirmation is open at a time and the panel offers one verdict, and a
 *   per-tool split would need a UI that does not exist. A rejection carries the
 *   reason on every tool; an approval carries none (the controller refuses a
 *   reason on an approved tool).
 * - An **ask_user** reply carries the answers positionally, one entry per
 *   question, each an array even for a single-select. Fewer answers than
 *   questions is refused *here* rather than resumed with a question silently
 *   dropped. A rejection of a question is not a thing the extension knows;
 *   declining is answering with nothing, which the controller refuses — so the
 *   panel does not offer it and this refuses it too.
 */
export function buildHitlResponse(
  request: HitlRequest,
  answer: HitlAnswer,
): JsonObject {
  if (request.type === HITL_TYPE_TOOL_APPROVAL_REQUEST) {
    const approved = answer.decision === 'approve';
    return {
      type: HITL_TYPE_TOOL_APPROVAL_RESPONSE,
      approvals: request.tools.map(tool => ({
        id: tool.id,
        approved,
        ...(!approved &&
          answer.rejectionReason && {
            rejection_reason: answer.rejectionReason,
          }),
      })),
    };
  }

  if (answer.decision !== 'approve') {
    throw new InputError(
      'A question cannot be rejected; answer it, or leave the session waiting.',
    );
  }
  const answers = answer.answers ?? [];
  if (answers.length !== request.questions.length) {
    throw new InputError(
      `The agent asked ${request.questions.length} question(s) and ${answers.length} answer(s) were given; every question needs one entry, in order.`,
    );
  }
  return {
    type: HITL_TYPE_ASK_USER_RESPONSE,
    id: request.id,
    answers: answers.map(values => ({ answer: values })),
  };
}
