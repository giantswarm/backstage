import {
  DEFAULT_MODEL_ANNOTATION,
  defaultIn,
  defaultMarkPatch,
  defaultModelIds,
  markedIn,
  planDefaultMove,
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

describe('defaultMarkPatch', () => {
  it('adds the mark, or removes it with a merge-patch null', () => {
    expect(defaultMarkPatch(true)).toEqual({
      metadata: { annotations: { [DEFAULT_MODEL_ANNOTATION]: 'true' } },
    });
    expect(defaultMarkPatch(false)).toEqual({
      metadata: { annotations: { [DEFAULT_MODEL_ANNOTATION]: null } },
    });
  });
});

describe('planDefaultMove', () => {
  const noOwner = () => undefined;

  it('takes the mark off the default the person saw', () => {
    const sonnet = model('sonnet', { marked: true });

    expect(
      planDefaultMove({
        modelConfigs: [sonnet, model('opus')],
        target: 'opus',
        expected: ['sonnet'],
        ownerOf: noOwner,
      }),
    ).toEqual([sonnet]);
  });

  it('takes nothing off where there is no default', () => {
    expect(
      planDefaultMove({
        modelConfigs: [model('opus')],
        target: 'opus',
        expected: [],
        ownerOf: noOwner,
      }),
    ).toEqual([]);
  });

  it('clears several marks the person saw, leaving one default', () => {
    expect(
      planDefaultMove({
        modelConfigs: [
          model('sonnet', { marked: true }),
          model('haiku', { marked: true }),
          model('opus'),
        ],
        target: 'opus',
        expected: ['haiku', 'sonnet'],
        ownerOf: noOwner,
      }).map(mc => mc.getName()),
    ).toEqual(['sonnet', 'haiku']);
  });

  it('refuses a mark that appeared since the person looked', () => {
    expect(() =>
      planDefaultMove({
        modelConfigs: [model('sonnet', { marked: true }), model('opus')],
        target: 'opus',
        expected: [],
        ownerOf: noOwner,
      }),
    ).toThrow(
      'sonnet became the default while this page was open, so nothing was changed. Reload the page and try again.',
    );
  });

  it('refuses to unmark a model Helm marks, naming the values key', () => {
    expect(() =>
      planDefaultMove({
        modelConfigs: [model('sonnet', { marked: true }), model('opus')],
        target: 'opus',
        expected: ['sonnet'],
        ownerOf: () => 'Helm',
      }),
    ).toThrow(
      'sonnet is the default through Helm values, which would mark it again. Move the default in the values (kagent.modelConfigs[].default).',
    );
  });

  it('ignores the mark the target already carries', () => {
    expect(
      planDefaultMove({
        modelConfigs: [model('opus', { marked: true })],
        target: 'opus',
        expected: [],
        ownerOf: noOwner,
      }),
    ).toEqual([]);
  });
});
