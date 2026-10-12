import type { GpuNode } from '../../lib/serving';
import { describeNode } from './GpuCapacityPanel';

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
});
