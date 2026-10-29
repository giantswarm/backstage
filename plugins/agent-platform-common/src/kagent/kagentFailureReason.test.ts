import {
  classifyFailureText,
  readInstanceFailureReason,
  readTaskFailureReason,
} from './kagentFailureReason';
import { normalizeTaskList } from './kagentSessionDetail';
import { A2aTaskWire } from './kagentTaskSchema';
import {
  tasksAskUserPending,
  tasksFailed,
  tasksRuntimeLost,
} from '../testFixtures';

/** A task in `state` whose status message says `text`. */
function task(state: string, message?: unknown): A2aTaskWire {
  return {
    id: 't1',
    contextId: 'c1',
    status: { state, ...(message === undefined ? {} : { message }) },
  } as A2aTaskWire;
}

function textMessage(text: string) {
  return {
    kind: 'message',
    messageId: 'm1',
    role: 'agent',
    parts: [{ kind: 'text', text }],
  };
}

describe('classifyFailureText', () => {
  it.each([
    // kagent's Go ADK model clients
    [
      'OpenAI chat completion request failed: POST "https://api.openai.com/v1/chat/completions": 404 Not Found',
    ],
    ['OpenAI responses request failed: 429 Too Many Requests'],
    ['anthropic API error: 529 overloaded'],
    ['SAP AI Core request failed: 503'],
    ['no running orchestration deployment found in SAP AI Core'],
    ['OPENAI_API_KEY environment variable is not set'],
    ['AZURE_OPENAI_ENDPOINT environment variable is not set'],
    [
      'operation error Bedrock Runtime: Converse, https response error StatusCode: 429, ThrottlingException',
    ],
    // the Claude Harness passes Claude Code's own words through
    ['API Error: 529 {"type":"error","error":{"type":"overloaded_error"}}'],
    // the Python ADK's LiteLLM errors
    ['litellm.RateLimitError: RateLimitError: OpenAIException'],
    // Gemini on Vertex AI
    ['Error 404, Message: Publisher Model `gemini-9` was not found'],
    ['{"code": "model_not_found"}'],
    ['anthropic API error: 401 Unauthorized invalid x-api-key'],
    ['litellm.ServiceUnavailableError: the model is overloaded'],
  ])('reads %s as model-unavailable', text => {
    expect(classifyFailureText(text)).toBe('model-unavailable');
  });

  it.each([
    ['failed to connect MCP client for kubernetes: 401 Unauthorized'],
    ['failed to create MCP toolset for github: connection refused'],
    ['failed to list MCP tools for muster: context deadline exceeded'],
    ['failed to resolve agent card for sre-agent: 404'],
  ])('reads %s as tool-failed', text => {
    expect(classifyFailureText(text)).toBe('tool-failed');
  });

  it.each([
    ['runtime lost: node is gone'],
    ['actor "ai-01a09e86" request timed out'],
    ['failed to connect to Session runtime'],
  ])('reads %s as runtime-lost', text => {
    expect(classifyFailureText(text)).toBe('runtime-lost');
  });

  it.each([
    ['Harness runtime execution failed'],
    ['Claude execution failed'],
    ['Codex execution failed'],
    ['output_validation_failed: root agent produced no result artifact'],
    // A tool call's own error goes back to the model; a turn that still
    // fails with it is not a tool that could not be reached.
    ['the tool returned an error: permission denied'],
    // A status code alone says nothing about who answered it.
    ['request failed with 503'],
    // The request was wrong, not the model unavailable: a new session or a
    // different request is the way out, not waiting for the model.
    [
      'OpenAI chat completion request failed: 400 Bad Request {"code": "context_length_exceeded"}',
    ],
    [
      'anthropic API error: 400 invalid_request_error: prompt is too long: 210000 tokens > 200000 maximum',
    ],
    ['API Error: 400 {"type":"invalid_request_error"}'],
    [
      'OpenAI chat completion request failed: 404 maximum context length is 128000 tokens',
    ],
    ['litellm.ContextWindowExceededError: input is too long'],
    ['litellm.BadRequestError: invalid tool schema'],
    ['litellm.ContentPolicyViolationError: refused'],
    ['Error 400, Message: Request contains an invalid argument.'],
    [
      'operation error Bedrock Runtime: Converse, StatusCode: 400, ValidationException: Input is too long',
    ],
    [''],
    [undefined],
  ])('reads %s as other', text => {
    expect(classifyFailureText(text)).toBe('other');
  });
});

describe('readTaskFailureReason', () => {
  it('classifies a failed turn from its status message', () => {
    const { tasks } = normalizeTaskList(tasksFailed);
    expect(readTaskFailureReason(tasks[tasks.length - 1])).toBe(
      'model-unavailable',
    );
  });

  it('reads a lost runtime off a failed turn', () => {
    const { tasks } = normalizeTaskList(tasksRuntimeLost);
    expect(readTaskFailureReason(tasks[tasks.length - 1])).toBe('runtime-lost');
  });

  it('classifies a rejected turn like a failed one', () => {
    expect(
      readTaskFailureReason(
        task('rejected', textMessage('anthropic API error: 503')),
      ),
    ).toBe('model-unavailable');
  });

  it('does not read a bare string message, as the session page does not', () => {
    expect(
      readTaskFailureReason(task('failed', 'runtime lost: node is gone')),
    ).toBe('other');
  });

  it('calls a failed turn without a message other', () => {
    expect(readTaskFailureReason(task('failed'))).toBe('other');
  });

  it.each(['completed', 'canceled', 'working', 'input-required', 'mystery'])(
    'gives no reason to a %s turn',
    state => {
      expect(
        readTaskFailureReason(task(state, textMessage('anthropic API error'))),
      ).toBeUndefined();
    },
  );

  it('gives no reason to a turn waiting on a question', () => {
    const { tasks } = normalizeTaskList(tasksAskUserPending);
    expect(readTaskFailureReason(tasks[tasks.length - 1])).toBeUndefined();
  });
});

describe('readInstanceFailureReason', () => {
  it('reads a lost runtime by its reason, whatever the message says', () => {
    expect(
      readInstanceFailureReason({
        reason: 'RUNTIME_LOST',
        message: 'anthropic API error',
      }),
    ).toBe('runtime-lost');
  });

  it('classifies any other failure by its message', () => {
    expect(
      readInstanceFailureReason({
        reason: 'PreparationFailed',
        message: 'failed to create MCP toolset for github: refused',
      }),
    ).toBe('tool-failed');
    expect(
      readInstanceFailureReason({
        reason: 'PreparationFailed',
        message: 'image pull failed',
      }),
    ).toBe('other');
  });

  it('calls an instance with no recorded failure other', () => {
    expect(readInstanceFailureReason(undefined)).toBe('other');
  });
});
