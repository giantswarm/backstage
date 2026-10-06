import { toManifestYaml } from './manifestYaml';
import type { KubeObjectInterface } from './KubeObject';

function makeObject(overrides: Partial<KubeObjectInterface> = {}): {
  jsonData: KubeObjectInterface;
} {
  return {
    jsonData: {
      apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
      kind: 'Kustomization',
      metadata: { name: 'my-app', namespace: 'flux-system' },
      spec: { path: './apps', interval: '10m' },
      status: { observedGeneration: 3 },
      ...overrides,
    },
  };
}

describe('toManifestYaml', () => {
  it('renders the object as YAML, status included', () => {
    const yaml = toManifestYaml(makeObject());

    expect(yaml).toContain('apiVersion: kustomize.toolkit.fluxcd.io/v1');
    expect(yaml).toContain('kind: Kustomization');
    expect(yaml).toContain('name: my-app');
    expect(yaml).toContain('path: ./apps');
    expect(yaml).toContain('observedGeneration: 3');
  });

  it('orders keys apiVersion, kind, metadata, spec, status', () => {
    const yaml = toManifestYaml(makeObject());

    const topLevelKeys = yaml
      .split('\n')
      .filter(line => /^\S/.test(line))
      .map(line => line.split(':')[0]);

    expect(topLevelKeys).toEqual([
      'apiVersion',
      'kind',
      'metadata',
      'spec',
      'status',
    ]);
  });

  it('drops managedFields', () => {
    const yaml = toManifestYaml(
      makeObject({
        metadata: {
          name: 'my-app',
          namespace: 'flux-system',
          managedFields: [
            {
              manager: 'kustomize-controller',
              operation: 'Apply',
              fieldsV1: { 'f:spec': { 'f:path': {} } },
            },
          ],
        },
      }),
    );

    expect(yaml).not.toContain('managedFields');
    expect(yaml).not.toContain('kustomize-controller');
  });

  it('drops the last-applied-configuration annotation and keeps the others', () => {
    const yaml = toManifestYaml(
      makeObject({
        metadata: {
          name: 'my-app',
          annotations: {
            'kubectl.kubernetes.io/last-applied-configuration': '{"kind":"x"}',
            'example.com/team': 'bumblebee',
          },
        },
      }),
    );

    expect(yaml).not.toContain('last-applied-configuration');
    expect(yaml).toContain('example.com/team: bumblebee');
  });

  it('omits annotations when only last-applied-configuration was set', () => {
    const yaml = toManifestYaml(
      makeObject({
        metadata: {
          name: 'my-app',
          annotations: {
            'kubectl.kubernetes.io/last-applied-configuration': '{"kind":"x"}',
          },
        },
      }),
    );

    expect(yaml).not.toContain('annotations');
  });

  it('does not fold long values', () => {
    const message = `Applied revision: main@sha1:${'a'.repeat(120)}`;
    const yaml = toManifestYaml(
      makeObject({ status: { conditions: [{ type: 'Ready', message }] } }),
    );

    expect(yaml.split('\n').some(line => line.includes(message))).toBe(true);
  });
});
