import {
  isPlatformComponents,
  NO_PLATFORM_COMPONENTS,
  parseApiGroupList,
} from './parseApiGroupList';

/** The shape `GET /apis` answers with (trimmed to what matters). */
function apiGroupList(names: string[]) {
  return {
    kind: 'APIGroupList',
    apiVersion: 'v1',
    groups: names.map(name => ({
      name,
      versions: [{ groupVersion: `${name}/v1`, version: 'v1' }],
      preferredVersion: { groupVersion: `${name}/v1`, version: 'v1' },
    })),
  };
}

describe('parseApiGroupList', () => {
  it('reads which platform components are installed from the group names', () => {
    expect(
      parseApiGroupList(
        apiGroupList([
          'apps',
          'kagent.dev',
          'serving.kserve.io',
          'helm.toolkit.fluxcd.io',
        ]),
      ),
    ).toEqual({ kagent: true, muster: false, kserve: true, capi: false });
    expect(
      parseApiGroupList(
        apiGroupList(['muster.giantswarm.io', 'cluster.x-k8s.io']),
      ),
    ).toEqual({ kagent: false, muster: true, kserve: false, capi: true });
  });

  it('reports nothing installed for a cluster without any platform group', () => {
    expect(parseApiGroupList(apiGroupList(['apps', 'batch']))).toEqual(
      NO_PLATFORM_COMPONENTS,
    );
    expect(parseApiGroupList({ groups: [] })).toEqual(NO_PLATFORM_COMPONENTS);
  });

  it('skips malformed group entries instead of failing the whole list', () => {
    expect(
      parseApiGroupList({
        groups: [null, 42, {}, { name: 7 }, { name: 'kagent.dev' }],
      }),
    ).toEqual({ kagent: true, muster: false, kserve: false, capi: false });
  });

  it.each([
    ['an empty object', {}],
    ['null', null],
    ['an array', ['kagent.dev']],
    ['a string', 'kagent.dev'],
    ['groups that is not an array', { groups: { name: 'kagent.dev' } }],
  ])('throws on %s: not an API group list', (_label, body) => {
    // A proxy error page or a sign-in form must not read as "no components",
    // which would silently empty every tab for that installation.
    expect(() => parseApiGroupList(body)).toThrow(
      expect.objectContaining({ name: 'ApiGroupListShapeError' }),
    );
  });
});

describe('isPlatformComponents', () => {
  it('accepts a complete boolean record', () => {
    expect(
      isPlatformComponents({
        kagent: true,
        muster: false,
        kserve: false,
        capi: true,
      }),
    ).toBe(true);
    expect(isPlatformComponents(NO_PLATFORM_COMPONENTS)).toBe(true);
  });

  it.each([
    ['a partial record', { kagent: true, kserve: false }],
    ['non-boolean flags', { kagent: 'yes', muster: 0, kserve: 1, capi: null }],
    ['the previous KServe probe shape', { hasInferenceServices: true }],
    ['a list of group names', ['kagent.dev']],
    ['undefined', undefined],
    ['null', null],
  ])(
    'rejects %s, so a stale persisted entry reads as unanswered',
    (_label, value) => {
      expect(isPlatformComponents(value)).toBe(false);
    },
  );
});
