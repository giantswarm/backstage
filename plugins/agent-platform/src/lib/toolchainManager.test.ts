import {
  classifyToolchainManagerError,
  defaultToolchainsOf,
  grantProvider,
  imageTag,
  isFinalBuildState,
  parseToolchainEntry,
  samePicks,
  toolchainEntry,
  toolchainManagerToolName,
  toolchainsLabel,
} from './toolchainManager';

describe('toolchainManager', () => {
  it('names the tools as muster exposes them', () => {
    expect(toolchainManagerToolName('list_toolchains')).toBe(
      'x_toolchain-manager_list_toolchains',
    );
  });

  it('names a toolchain as start_session takes it, the version as its image tag', () => {
    expect(imageTag('v0.1.0')).toBe('0.1.0');
    expect(toolchainEntry({ name: 'go', version: 'v0.1.0' })).toBe('go@0.1.0');
    expect(toolchainEntry({ name: 'go', version: '0.1.0' })).toBe('go@0.1.0');
    expect(toolchainEntry({ name: 'node' })).toBe('node');
  });

  it('reads an entry back, latest as no version', () => {
    expect(parseToolchainEntry('go@0.1.0')).toEqual({
      name: 'go',
      version: '0.1.0',
    });
    expect(parseToolchainEntry('node@latest')).toEqual({ name: 'node' });
    expect(parseToolchainEntry(' github ')).toEqual({ name: 'github' });
  });

  it("reads an agent's default toolchains off its annotation", () => {
    expect(defaultToolchainsOf(' go@0.2.0, node ,')).toEqual([
      { name: 'go', version: '0.2.0' },
      { name: 'node' },
    ]);
    expect(defaultToolchainsOf(undefined)).toEqual([]);
  });

  it('says a set of toolchains in a line', () => {
    expect(
      toolchainsLabel([{ name: 'go', version: 'v0.1.0' }, { name: 'node' }]),
    ).toBe('go 0.1.0, node latest');
    expect(toolchainsLabel([])).toBe('No toolchains');
  });

  it('compares sets by what they mount, in any order', () => {
    expect(
      samePicks(
        [{ name: 'node' }, { name: 'go', version: 'v0.1.0' }],
        [{ name: 'go', version: '0.1.0' }, { name: 'node' }],
      ),
    ).toBe(true);
    expect(
      samePicks([{ name: 'go', version: '0.1.0' }], [{ name: 'go' }]),
    ).toBe(false);
  });

  it("turns a grant_required answer into the App's sign-in in muster", () => {
    expect(
      grantProvider({
        status: 'grant_required',
        apps: ['toolchain-manager'],
        message: 'grant it',
      }),
    ).toEqual({
      name: 'toolchain-manager',
      kind: 'github',
      connected: false,
      signIn: 'core_auth_login app=toolchain-manager',
    });
    expect(grantProvider({ message: '3 toolchains' })).toBeUndefined();
    expect(grantProvider(undefined)).toBeUndefined();
  });

  it('knows the build states that no longer move', () => {
    expect(isFinalBuildState('published')).toBe(true);
    expect(isFinalBuildState('failed')).toBe(true);
    expect(isFinalBuildState('checking')).toBe(false);
  });

  it("classifies muster's not-connected answers as unavailable", () => {
    const error = classifyToolchainManagerError(
      new Error('x_toolchain-manager_list_toolchains: tool not found'),
    );
    expect(error.name).toBe('ToolchainManagerError');
    expect(error.kind).toBe('unavailable');
    expect(classifyToolchainManagerError(new Error('boom')).kind).toBe(
      'failed',
    );
  });
});
