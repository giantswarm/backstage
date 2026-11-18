import { readConfirmationHints, withoutHints } from './kagentConfirmation';

const HINT =
  'Please approve or reject the tool call call_tool() by responding with a FunctionResponse with an expected ToolConfirmation payload.';

function confirmation(originalFunctionCall: object, hint = HINT) {
  return {
    kind: 'data',
    metadata: { kagent_type: 'function_call' },
    data: {
      id: 'confirm-1',
      name: 'adk_request_confirmation',
      args: { originalFunctionCall, toolConfirmation: { hint } },
    },
  };
}

describe('readConfirmationHints', () => {
  it('reads the hint of an approval that names its tool', () => {
    const parts = [
      { kind: 'text', text: HINT },
      confirmation({ name: 'call_tool', args: { name: 'x_a_b' } }),
    ];
    expect(readConfirmationHints(parts)).toEqual([HINT]);
  });

  it('reads the hint of a question it can read', () => {
    const parts = [
      confirmation({
        name: 'ask_user',
        args: { questions: [{ question: 'Which cluster?' }] },
      }),
    ];
    expect(readConfirmationHints(parts)).toEqual([HINT]);
  });

  it('keeps the hint of a question it cannot read, the only readable text', () => {
    const parts = [
      confirmation({ name: 'ask_user', args: { questions: 'odd shape' } }),
    ];
    expect(readConfirmationHints(parts)).toEqual([]);
  });

  it('keeps the hint of an approval that names no tool', () => {
    expect(readConfirmationHints([confirmation({ args: {} })])).toEqual([]);
  });
});

describe('withoutHints', () => {
  it('drops a text that is the hint', () => {
    expect(withoutHints(HINT, [HINT])).toBe('');
  });

  it('drops the hint from the end of the agent’s prose', () => {
    expect(withoutHints(`I need to roll back.\n\n${HINT}`, [HINT])).toBe(
      'I need to roll back.',
    );
  });

  it('leaves prose that does not end with the hint', () => {
    expect(withoutHints('I need to roll back.', [HINT])).toBe(
      'I need to roll back.',
    );
  });
});
