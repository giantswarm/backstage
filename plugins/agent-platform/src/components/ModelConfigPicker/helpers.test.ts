import { preselectedModelConfig, tenantModelConfigs } from './helpers';

function modelConfig(namespace: string, name: string) {
  return { getName: () => name, getNamespace: () => namespace };
}

describe('preselectedModelConfig', () => {
  it('has nothing to preselect without models', () => {
    expect(preselectedModelConfig([])).toBeUndefined();
  });

  it('picks the only model', () => {
    const only = modelConfig('team', 'sonnet');

    expect(preselectedModelConfig([only])).toEqual({
      modelConfig: only,
      reason: 'only',
    });
  });

  it("picks the installation's default model among several", () => {
    const fallback = modelConfig('kagent', 'default-model-config');

    expect(
      preselectedModelConfig([
        modelConfig('kagent', 'haiku'),
        fallback,
        modelConfig('kagent', 'opus'),
      ]),
    ).toEqual({ modelConfig: fallback, reason: 'default' });
  });

  it("prefers the kagent namespace's default when several namespaces hold one", () => {
    const platform = modelConfig('kagent', 'default-model-config');

    expect(
      preselectedModelConfig([
        modelConfig('team', 'default-model-config'),
        platform,
      ]),
    ).toEqual({ modelConfig: platform, reason: 'default' });
  });

  it('falls back to the first model when none is the default', () => {
    const first = modelConfig('kagent', 'haiku');

    expect(
      preselectedModelConfig([first, modelConfig('kagent', 'opus')]),
    ).toEqual({ modelConfig: first, reason: 'first' });
  });
});

describe('tenantModelConfigs', () => {
  const model = (name: string, namespace: string) => ({
    getName: () => name,
    getNamespace: () => namespace,
    getDisplayName: () => `${name} (${namespace})`,
    getModel: () => 'claude',
    getProvider: () => 'Anthropic',
  });
  const where = (choices: ReturnType<typeof tenantModelConfigs>) =>
    choices.map(mc => `${mc.getNamespace()}/${mc.getName()}`);
  const platformDefault = model('default-model-config', 'kagent');

  it('offers a tenant without its copy yet the platform default, in the tenant', () => {
    const choices = tenantModelConfigs(
      [platformDefault, model('own-key', 'org-acme'), model('x', 'org-b')],
      'org-acme',
    );

    expect(where(choices)).toEqual([
      'org-acme/default-model-config',
      'org-acme/own-key',
    ]);
    expect(choices[0].getDisplayName()).toBe(platformDefault.getDisplayName());
  });

  it('offers a tenant its own copy once it exists, and nothing twice', () => {
    expect(
      where(
        tenantModelConfigs(
          [platformDefault, model('default-model-config', 'org-acme')],
          'org-acme',
        ),
      ),
    ).toEqual(['org-acme/default-model-config']);
  });

  it('offers no stand-in in a namespace that is not an Organization’s', () => {
    // agent-manager accepts a model before its copy exists in a tenant only.
    expect(
      where(
        tenantModelConfigs([platformDefault, model('x', 'team-a')], 'team-a'),
      ),
    ).toEqual(['team-a/x']);
  });
});
