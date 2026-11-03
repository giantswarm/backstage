import { ResourceSet } from './ResourceSet';

function createResourceSet(spec: Record<string, unknown>): ResourceSet {
  const json = {
    apiVersion: 'fluxcd.controlplane.io/v1',
    kind: 'ResourceSet',
    metadata: { name: 'apps', namespace: 'tenant-a' },
    spec,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ResourceSet(json as any, 'test-installation');
}

describe('ResourceSet', () => {
  it('resolves input providers by name or selector in its own namespace', () => {
    const resourceSet = createResourceSet({
      inputsFrom: [
        { kind: 'ResourceSetInputProvider', name: 'branches' },
        {
          kind: 'ResourceSetInputProvider',
          selector: { matchLabels: { team: 'a' } },
        },
        { kind: 'ResourceSetInputProvider' },
      ],
    });

    expect(resourceSet.getInputProviderRefs()).toEqual([
      { name: 'branches', namespace: 'tenant-a' },
      { selector: { matchLabels: { team: 'a' } }, namespace: 'tenant-a' },
    ]);
  });

  it('applies the CRD defaults for the input strategy and wait', () => {
    const resourceSet = createResourceSet({});

    expect(resourceSet.getInputStrategy()).toBe('Flatten');
    expect(resourceSet.getWait()).toBe(true);
    expect(resourceSet.getInputProviderRefs()).toEqual([]);
  });

  it('reads an explicit input strategy and wait', () => {
    const resourceSet = createResourceSet({
      inputStrategy: { name: 'Permute' },
      wait: false,
    });

    expect(resourceSet.getInputStrategy()).toBe('Permute');
    expect(resourceSet.getWait()).toBe(false);
  });
});
