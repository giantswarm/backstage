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

  it('offers a tenant its own models only: no model is copied into it', () => {
    expect(
      where(
        tenantModelConfigs(
          [platformDefault, model('own-key', 'org-acme'), model('x', 'org-b')],
          'org-acme',
        ),
      ),
    ).toEqual(['org-acme/own-key']);
  });

  it('offers another namespace its own models only', () => {
    expect(
      where(
        tenantModelConfigs([platformDefault, model('x', 'team-a')], 'team-a'),
      ),
    ).toEqual(['team-a/x']);
  });
});
