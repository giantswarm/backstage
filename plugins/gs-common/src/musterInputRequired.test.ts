import {
  inputRequiredBodyOf,
  isMusterInputAnswer,
  toolInputRequiredOf,
} from './musterInputRequired';

const elicitation = {
  key: 'muster_sign_in',
  url: 'https://muster/oauth/proxy/start?state=abc',
  message: 'Sign in to github to continue.',
};

describe('inputRequiredBodyOf', () => {
  it("reads a muster proxy's input_required body", () => {
    expect(
      inputRequiredBodyOf({
        error: {
          name: 'MusterInputRequiredError',
          message: 'Sign in to github to continue.',
          elicitations: [elicitation],
          requestState: 'opaque',
        },
      }),
    ).toEqual({ elicitations: [elicitation], requestState: 'opaque' });
  });

  it.each([
    [
      'another error',
      { error: { name: 'Error', elicitations: [elicitation] } },
    ],
    [
      'no elicitation',
      { error: { name: 'MusterInputRequiredError', elicitations: [] } },
    ],
    [
      'an elicitation without a url',
      {
        error: {
          name: 'MusterInputRequiredError',
          elicitations: [{ key: 'k', message: 'm' }],
        },
      },
    ],
    [
      'a requestState that is no string',
      {
        error: {
          name: 'MusterInputRequiredError',
          elicitations: [elicitation],
          requestState: 1,
        },
      },
    ],
    ['no body', undefined],
  ])('reads nothing from %s', (_, body) => {
    expect(inputRequiredBodyOf(body)).toBeUndefined();
  });
});

describe('toolInputRequiredOf', () => {
  const inputRequired = {
    tool: 'x_github_search',
    arguments: { query: 'q' },
    elicitations: [elicitation],
    requestState: 'opaque',
  };

  it('reads the input_required answer of a tool output', () => {
    expect(toolInputRequiredOf({ inputRequired, content: [] })).toEqual(
      inputRequired,
    );
  });

  it.each([
    ['a tool result', { content: [{ type: 'text', text: 'ok' }] }],
    ['no tool', { inputRequired: { ...inputRequired, tool: undefined } }],
    [
      'no arguments',
      { inputRequired: { ...inputRequired, arguments: undefined } },
    ],
    [
      'no elicitation',
      { inputRequired: { ...inputRequired, elicitations: [] } },
    ],
    ['no output', undefined],
  ])('reads nothing from %s', (_, output) => {
    expect(toolInputRequiredOf(output)).toBeUndefined();
  });
});

describe('isMusterInputAnswer', () => {
  it('accepts answers by key with an optional requestState', () => {
    expect(
      isMusterInputAnswer({
        inputResponses: { muster_sign_in: { action: 'decline' } },
        requestState: 'opaque',
      }),
    ).toBe(true);
  });

  it.each([
    ['no answers', { inputResponses: {} }],
    ['an unknown action', { inputResponses: { k: { action: 'maybe' } } }],
    [
      'a requestState that is no string',
      { inputResponses: { k: { action: 'accept' } }, requestState: {} },
    ],
    ['an array', []],
  ])('refuses %s', (_, value) => {
    expect(isMusterInputAnswer(value)).toBe(false);
  });
});
