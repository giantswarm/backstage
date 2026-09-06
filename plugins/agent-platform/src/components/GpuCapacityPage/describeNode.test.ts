import type { GpuNode } from '../../lib/serving';
import {
  describeNode,
  HOST_NODE_DESCRIPTION,
  hostNodeDescription,
} from './GpuCapacityPanel';

function hostNode(overrides: Partial<GpuNode>): GpuNode {
  return {
    id: 'lab/ollama/172.21.0.1',
    installation: 'lab',
    name: '172.21.0.1',
    ready: true,
    memoryBudgetSource: 'host-meminfo',
    ...overrides,
  } as GpuNode;
}

describe('describeNode · backend hosts', () => {
  it('names the server of a backend host, so two backends on one address read apart', () => {
    expect(describeNode(hostNode({ backend: 'ollama' }))).toBe('Ollama host');
    expect(
      describeNode(
        hostNode({ id: 'lab/lemonade/172.21.0.1', backend: 'lemonade' }),
      ),
    ).toBe('Lemonade host');
  });

  it('falls back to the generic description without a backend', () => {
    expect(hostNodeDescription(hostNode({}))).toBe(HOST_NODE_DESCRIPTION);
    expect(describeNode(hostNode({}))).toBe(HOST_NODE_DESCRIPTION);
  });

  it('keeps a fault ahead of the host description', () => {
    expect(describeNode(hostNode({ backend: 'ollama', ready: false }))).toBe(
      'Not ready',
    );
  });
});
