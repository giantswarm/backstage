import { mcpToolRefusalOf, parseToolErrorCode } from './mcpToolRefusals';

describe('parseToolErrorCode', () => {
  it('reads the code and the text after it', () => {
    expect(parseToolErrorCode('conflict: agent "a" exists')).toEqual({
      code: 'conflict',
      text: 'agent "a" exists',
    });
    expect(parseToolErrorCode('not_found:\nno agent')).toEqual({
      code: 'not_found',
      text: 'no agent',
    });
    expect(parseToolErrorCode('Tool execution failed')).toBeUndefined();
  });
});

describe('mcpToolRefusalOf', () => {
  it.each([
    [
      'agent-manager',
      'gitops_owned: release "a" is applied from git',
      'gitops_owned',
    ],
    ['agent-manager', 'backend_error: the apiserver did not answer', undefined],
    ['model-manager', 'does_not_fit: needs 40 GiB', 'does_not_fit'],
    ['model-manager', 'gitops_owned: x', undefined],
    ['workspace-manager', 'sync_workspace: not found: docs', 'not_found'],
    ['workspace-manager', 'sync_workspace: git fetch failed', undefined],
    ['kubernetes', 'not_found: no such pod', undefined],
    [undefined, 'not_found: x', undefined],
  ])('reads %s answering %j as %s', (server, message, refusal) => {
    expect(mcpToolRefusalOf(server, message)).toBe(refusal);
  });
});
