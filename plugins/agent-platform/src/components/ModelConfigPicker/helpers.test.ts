import { preselectedModelConfig } from './helpers';

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
