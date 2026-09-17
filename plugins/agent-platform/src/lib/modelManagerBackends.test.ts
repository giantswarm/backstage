import {
  addBackendArgs,
  backendsWithoutModels,
  classifyModelManagerToolError,
  describeBackendSource,
  isValidEndpoint,
  ModelManagerNotConnectedError,
  ModelManagerToolError,
  modelManagerToolName,
} from './modelManagerBackends';

describe('modelManagerBackends', () => {
  it('names the tools as muster exposes them', () => {
    expect(modelManagerToolName('add_backend')).toBe(
      'x_model-manager_add_backend',
    );
  });

  it('sends a host backend with its endpoints, trimmed, and nothing of kserve', () => {
    expect(
      addBackendArgs(
        {
          kind: 'ollama',
          endpoint: ' http://ollama.lab:11434 ',
          agentEndpoint: '',
          servingNamespace: 'left over from switching the kind',
          credentialsSecret: 'hf-token',
          credentialsKey: '',
        },
        { dryRun: true },
      ),
    ).toEqual({
      kind: 'ollama',
      endpoint: 'http://ollama.lab:11434',
      credentialsSecret: 'hf-token',
      dryRun: true,
    });
  });

  it('sends kserve with its target and no endpoint, mode apply by default', () => {
    expect(
      addBackendArgs({
        kind: 'kserve',
        endpoint: 'http://not-for-kserve',
        cluster: 'local',
        servingNamespace: 'model-serving',
      }),
    ).toEqual({
      kind: 'kserve',
      cluster: 'local',
      servingNamespace: 'model-serving',
      mode: 'apply',
    });
    expect(
      addBackendArgs(
        { kind: 'lemonade', endpoint: 'http://x' },
        { mode: 'commit' },
      ).mode,
    ).toBe('commit');
  });

  it('accepts http(s) base URLs only', () => {
    expect(isValidEndpoint('http://ollama.lab:11434')).toBe(true);
    expect(isValidEndpoint('https://api.gpu01.example.com:6443')).toBe(true);
    expect(isValidEndpoint('ollama.lab:11434')).toBe(false);
    expect(isValidEndpoint('ftp://x')).toBe(false);
    expect(isValidEndpoint('')).toBe(false);
  });

  it('phrases the source for a group header', () => {
    expect(describeBackendSource('person')).toBe('Registered from the portal');
    expect(describeBackendSource('cluster-manager')).toBe(
      'Registered by cluster-manager',
    );
    expect(describeBackendSource(undefined)).toBe('');
  });

  it("keeps model-manager's refusal verbatim with its code, and tells not-connected apart", () => {
    const refused = classifyModelManagerToolError(
      new Error(
        'conflict: conflict: backend ollama is configured statically by the chart values (--backends); remove it there to register it at runtime',
      ),
    );
    expect(refused).toBeInstanceOf(ModelManagerToolError);
    expect((refused as ModelManagerToolError).code).toBe('conflict');
    // The status word maps onto the error name the plugin's reads key on.
    expect(refused.name).toBe('ConflictError');
    expect(refused.message).toMatch(/configured statically/);
    expect(
      classifyModelManagerToolError(new Error('not_found: no such model')).name,
    ).toBe('NotFoundError');
    expect(
      classifyModelManagerToolError(new Error('does_not_fit: needs 21 GB'))
        .name,
    ).toBe('PreconditionFailedError');
    expect(
      classifyModelManagerToolError(new Error('something else entirely')).name,
    ).toBe('ModelManagerToolError');

    expect(
      classifyModelManagerToolError(
        new Error('tool not found: x_model-manager_add_backend'),
      ),
    ).toBeInstanceOf(ModelManagerNotConnectedError);
  });

  it('lists the registered backends that have no group on the page', () => {
    const registered = [
      { installation: 'lab', kind: 'ollama' },
      { installation: 'lab', kind: 'kserve' },
      { installation: 'other', kind: 'ollama' },
    ];
    expect(
      backendsWithoutModels(registered, [
        { installation: 'lab', backend: 'ollama' },
        { installation: 'lab', backend: 'ollama' },
      ]),
    ).toEqual([
      { installation: 'lab', kind: 'kserve' },
      { installation: 'other', kind: 'ollama' },
    ]);
    expect(backendsWithoutModels(registered, [])).toEqual(registered);
    expect(backendsWithoutModels([], [])).toEqual([]);
  });
});
