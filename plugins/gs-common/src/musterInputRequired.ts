/**
 * muster's `input_required` answer to a tool call (MCP 2026-07-28
 * multi-round-trip requests), as a muster proxy passes it to the page: the
 * URL elicitations the person answers, and the `requestState` the retry
 * echoes. The proxy answers it with {@link MUSTER_INPUT_REQUIRED_STATUS} and
 * `error.name` {@link MUSTER_INPUT_REQUIRED_ERROR}; the tool has not run.
 */

/** The status a muster proxy answers an `input_required` call with. */
export const MUSTER_INPUT_REQUIRED_STATUS = 428;

/** The `error.name` of that answer. */
export const MUSTER_INPUT_REQUIRED_ERROR = 'MusterInputRequiredError';

/** One URL elicitation of an `input_required` answer. */
export interface MusterUrlElicitation {
  /** Its key in `inputRequests`, which its answer keeps in `inputResponses`. */
  key: string;
  /** The page the person is asked to open. */
  url: string;
  /** The server's words on why, plain text. */
  message: string;
  elicitationId?: string;
}

export type MusterElicitationAction = 'accept' | 'decline' | 'cancel';

const ELICITATION_ACTIONS: readonly MusterElicitationAction[] = [
  'accept',
  'decline',
  'cancel',
];

/**
 * The retry of a call muster answered with `input_required`: the person's
 * answer to each elicitation by key, and muster's `requestState` unchanged.
 */
export interface MusterInputAnswer {
  inputResponses: Record<string, { action: MusterElicitationAction }>;
  requestState?: string;
}

/** The body of a muster proxy's `input_required` answer. */
export interface MusterInputRequiredBody {
  elicitations: MusterUrlElicitation[];
  requestState?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUrlElicitation(value: unknown): value is MusterUrlElicitation {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.url === 'string' &&
    typeof value.message === 'string' &&
    (value.elicitationId === undefined ||
      typeof value.elicitationId === 'string')
  );
}

/**
 * The `input_required` answer in a muster proxy's error body
 * (`{error: {name, elicitations, requestState}}`); undefined for any other
 * body.
 */
export function inputRequiredBodyOf(
  errorData: unknown,
): MusterInputRequiredBody | undefined {
  const error = isRecord(errorData) ? errorData.error : undefined;
  if (!isRecord(error) || error.name !== MUSTER_INPUT_REQUIRED_ERROR) {
    return undefined;
  }
  const { elicitations, requestState } = error;
  if (
    !Array.isArray(elicitations) ||
    elicitations.length === 0 ||
    !elicitations.every(isUrlElicitation) ||
    (requestState !== undefined && typeof requestState !== 'string')
  ) {
    return undefined;
  }
  return { elicitations, requestState };
}

/** Whether a request body's `input` is a well-formed {@link MusterInputAnswer}. */
export function isMusterInputAnswer(
  value: unknown,
): value is MusterInputAnswer {
  if (!isRecord(value) || !isRecord(value.inputResponses)) {
    return false;
  }
  if (
    value.requestState !== undefined &&
    typeof value.requestState !== 'string'
  ) {
    return false;
  }
  const responses = Object.values(value.inputResponses);
  return (
    responses.length > 0 &&
    responses.every(
      response =>
        isRecord(response) &&
        ELICITATION_ACTIONS.includes(
          response.action as MusterElicitationAction,
        ),
    )
  );
}
