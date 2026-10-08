import { toKubectlYaml } from './kubectlYaml';
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

describe('toKubectlYaml', () => {
  it('renders the object as YAML, status included', () => {
    const yaml = toKubectlYaml(makeObject());

    expect(yaml).toContain('apiVersion: kustomize.toolkit.fluxcd.io/v1');
    expect(yaml).toContain('kind: Kustomization');
    expect(yaml).toContain('name: my-app');
    expect(yaml).toContain('path: ./apps');
    expect(yaml).toContain('observedGeneration: 3');
  });

  // kubectl prints keys alphabetically at every level, which is what this view
  // is compared against.
  it('sorts keys alphabetically at every level, like kubectl', () => {
    const yaml = toKubectlYaml(
      makeObject({
        metadata: {
          name: 'my-app',
          namespace: 'flux-system',
          uid: '1234',
          annotations: { 'example.com/team': 'bumblebee' },
        },
      }),
    );

    const keysAtIndent = (indent: string) =>
      yaml
        .split('\n')
        .filter(line => new RegExp(`^${indent}[A-Za-z]`).test(line))
        .map(line => line.trim().split(':')[0]);

    expect(keysAtIndent('')).toEqual([
      'apiVersion',
      'kind',
      'metadata',
      'spec',
      'status',
    ]);
    // The children of `metadata`, `spec` and `status`, in document order.
    expect(keysAtIndent('  ')).toEqual([
      'annotations',
      'name',
      'namespace',
      'uid',
      'interval',
      'path',
      'observedGeneration',
    ]);
  });

  it('drops managedFields', () => {
    const yaml = toKubectlYaml(
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
    const yaml = toKubectlYaml(
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
    const yaml = toKubectlYaml(
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
    const yaml = toKubectlYaml(
      makeObject({ status: { conditions: [{ type: 'Ready', message }] } }),
    );

    expect(yaml.split('\n').some(line => line.includes(message))).toBe(true);
  });
});
