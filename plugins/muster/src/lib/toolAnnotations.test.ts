import { isDestructive, isReadOnly, toolEffect } from './toolAnnotations';

describe('toolAnnotations', () => {
  it.each([
    [{ readOnlyHint: true }, 'reads'],
    [{ readOnlyHint: true, destructiveHint: true }, 'reads'],
    [{ readOnlyHint: false }, 'changes'],
    [{ destructiveHint: true }, 'changes'],
    [{}, 'changes'],
    [undefined, 'changes'],
  ] as const)('reads %p as %s', (annotations, effect) => {
    expect(toolEffect({ annotations })).toBe(effect);
  });

  it('agrees with isReadOnly', () => {
    const tool = { annotations: { readOnlyHint: true } };
    expect(isReadOnly(tool)).toBe(true);
    expect(isDestructive(tool)).toBe(false);
  });
});
