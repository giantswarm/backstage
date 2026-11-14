import {
  DEFAULT_MODEL_ANNOTATION,
  defaultIn,
  defaultModelIds,
  markedIn,
} from './defaultModel';

function model(
  name: string,
  { namespace = 'kagent', marked = false, cluster = 'gazelle' } = {},
) {
  return {
    cluster,
    getName: () => name,
    getNamespace: () => namespace,
    getAnnotations: () =>
      marked ? { [DEFAULT_MODEL_ANNOTATION]: 'true' } : undefined,
  };
}

describe('defaultIn', () => {
  it('is the one marked model of the namespace', () => {
    const models = [
      model('haiku'),
      model('sonnet', { marked: true }),
      model('opus', { namespace: 'org-acme', marked: true }),
    ];

    expect(defaultIn(models, 'kagent')).toBe('sonnet');
    expect(defaultIn(models, 'org-acme')).toBe('opus');
  });

  it('is none without a mark, or with several', () => {
    expect(defaultIn([model('haiku')], 'kagent')).toBeUndefined();
    expect(
      defaultIn(
        [model('haiku', { marked: true }), model('sonnet', { marked: true })],
        'kagent',
      ),
    ).toBeUndefined();
  });

  it('gives default-model-config no special meaning', () => {
    expect(
      defaultIn([model('default-model-config')], 'kagent'),
    ).toBeUndefined();
  });

  it('reads only "true" as a mark', () => {
    const almost = {
      ...model('sonnet'),
      getAnnotations: () => ({ [DEFAULT_MODEL_ANNOTATION]: 'false' }),
    };

    expect(markedIn([almost], 'kagent')).toEqual([]);
  });
});

describe('defaultModelIds', () => {
  it('resolves each namespace of each installation on its own', () => {
    expect(
      defaultModelIds([
        model('sonnet', { marked: true }),
        model('sonnet', { marked: true, cluster: 'glean' }),
        model('haiku', { marked: true, cluster: 'glean' }),
        model('opus', { namespace: 'org-acme', marked: true }),
      ]),
    ).toEqual(new Set(['gazelle/kagent/sonnet', 'gazelle/org-acme/opus']));
  });
});
