import { GiantSwarmLocationProcessor } from './processor';

const yaml = require('js-yaml');

describe('GiantSwarmLocationProcessor', () => {
  function mockUrlReader(
    files: Record<string, string>,
    searchFiles?: Record<string, Array<{ url: string; key: string }>>,
  ) {
    return {
      readUrl: jest.fn((url: string) => {
        const content = files[url];
        if (!content) throw new Error(`Not found: ${url}`);
        return Promise.resolve({
          buffer: () => Promise.resolve(Buffer.from(content)),
        });
      }),
      search: jest.fn((url: string) => {
        const entries = searchFiles?.[url] ?? [];
        return Promise.resolve({
          files: entries.map(entry => ({
            url: entry.url,
            content: () => Promise.resolve(Buffer.from(files[entry.key]!)),
          })),
        });
      }),
    };
  }

  const componentYaml = yaml.dump({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'my-component' },
  });

  const templateYaml = yaml.dump({
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: { name: 'app-deployment' },
    spec: { type: 'service' },
  });

  const namespacedYaml = yaml.dump({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'explicit-ns', namespace: 'custom' },
  });

  it('returns false for non-matching location types', async () => {
    const reader = mockUrlReader({});
    const processor = new GiantSwarmLocationProcessor(reader);
    const emit = jest.fn();

    const handled = await processor.readLocation(
      { type: 'url', target: 'https://example.com/file.yaml' },
      false,
      emit,
      undefined as any,
      undefined as any,
    );

    expect(handled).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('sets giantswarm namespace on entities', async () => {
    const target =
      'https://github.com/giantswarm/repo/blob/main/catalog-info.yaml';
    const reader = mockUrlReader({ [target]: componentYaml });
    const processor = new GiantSwarmLocationProcessor(reader);
    const emit = jest.fn();

    const handled = await processor.readLocation(
      { type: 'giantswarm', target },
      false,
      emit,
      undefined as any,
      undefined as any,
    );

    expect(handled).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);

    const emitted = emit.mock.calls[0][0];
    expect(emitted.type).toBe('entity');
    expect(emitted.entity.metadata.namespace).toBe('giantswarm');
    expect(emitted.entity.metadata.name).toBe('my-component');
  });

  it('does not override explicit namespace', async () => {
    const target =
      'https://github.com/giantswarm/repo/blob/main/catalog-info.yaml';
    const reader = mockUrlReader({ [target]: namespacedYaml });
    const processor = new GiantSwarmLocationProcessor(reader);
    const emit = jest.fn();

    await processor.readLocation(
      { type: 'giantswarm', target },
      false,
      emit,
      undefined as any,
      undefined as any,
    );

    expect(emit.mock.calls[0][0].entity.metadata.namespace).toBe('custom');
  });

  it('handles glob patterns via search', async () => {
    const globTarget =
      'https://github.com/giantswarm/repo/blob/main/catalogs/*.yaml';
    const file1Url =
      'https://github.com/giantswarm/repo/blob/main/catalogs/a.yaml';
    const file2Url =
      'https://github.com/giantswarm/repo/blob/main/catalogs/b.yaml';

    const reader = mockUrlReader(
      { file1: componentYaml, file2: templateYaml },
      {
        [globTarget]: [
          { url: file1Url, key: 'file1' },
          { url: file2Url, key: 'file2' },
        ],
      },
    );
    const processor = new GiantSwarmLocationProcessor(reader);
    const emit = jest.fn();

    await processor.readLocation(
      { type: 'giantswarm', target: globTarget },
      false,
      emit,
      undefined as any,
      undefined as any,
    );

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0].entity.metadata.namespace).toBe('giantswarm');
    expect(emit.mock.calls[1][0].entity.metadata.namespace).toBe('giantswarm');
    expect(emit.mock.calls[0][0].location.target).toBe(file1Url);
    expect(emit.mock.calls[1][0].location.target).toBe(file2Url);
  });

  it('handles multi-document YAML', async () => {
    const target = 'https://github.com/giantswarm/repo/blob/main/multi.yaml';
    const multiDoc = `${componentYaml}---\n${templateYaml}`;
    const reader = mockUrlReader({ [target]: multiDoc });
    const processor = new GiantSwarmLocationProcessor(reader);
    const emit = jest.fn();

    await processor.readLocation(
      { type: 'giantswarm', target },
      false,
      emit,
      undefined as any,
      undefined as any,
    );

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0].entity.kind).toBe('Component');
    expect(emit.mock.calls[1][0].entity.kind).toBe('Template');
  });

  it('emits error for failed reads when not optional', async () => {
    const target = 'https://github.com/giantswarm/repo/blob/main/missing.yaml';
    const reader = mockUrlReader({});
    const processor = new GiantSwarmLocationProcessor(reader);
    const emit = jest.fn();

    await processor.readLocation(
      { type: 'giantswarm', target },
      false,
      emit,
      undefined as any,
      undefined as any,
    );

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].type).toBe('error');
  });

  it('silently skips failed reads when optional', async () => {
    const target = 'https://github.com/giantswarm/repo/blob/main/missing.yaml';
    const reader = mockUrlReader({});
    const processor = new GiantSwarmLocationProcessor(reader);
    const emit = jest.fn();

    await processor.readLocation(
      { type: 'giantswarm', target },
      true,
      emit,
      undefined as any,
      undefined as any,
    );

    expect(emit).not.toHaveBeenCalled();
  });

  it('skips non-entity YAML documents', async () => {
    const target = 'https://github.com/giantswarm/repo/blob/main/mixed.yaml';
    const content = `${componentYaml}---\nfoo: bar\n`;
    const reader = mockUrlReader({ [target]: content });
    const processor = new GiantSwarmLocationProcessor(reader);
    const emit = jest.fn();

    await processor.readLocation(
      { type: 'giantswarm', target },
      false,
      emit,
      undefined as any,
      undefined as any,
    );

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].entity.kind).toBe('Component');
  });

  it('returns processor name', () => {
    const processor = new GiantSwarmLocationProcessor({} as any);
    expect(processor.getProcessorName()).toBe('GiantSwarmLocationProcessor');
  });
});
