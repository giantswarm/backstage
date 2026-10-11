import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import type { CatalogueGroup } from '../../lib/toolset';
import {
  changingToolCount,
  effectCounts,
  effectDimension,
  effectFromPicks,
  filterCatalogueByEffect,
} from './catalogueEffect';

const tool = (name: string, readOnly?: boolean): ToolSummary => ({
  name,
  ...(readOnly === undefined
    ? {}
    : { annotations: { readOnlyHint: readOnly } }),
});

const bucket = (name: string, tools: ToolSummary[], needsSignIn = false) =>
  ({ name, tools, needsSignIn }) as unknown as CatalogueGroup['servers'][0];

const group = (
  key: string,
  parts: Partial<
    Pick<CatalogueGroup, 'servers' | 'platformAdministration' | 'workflows'>
  >,
): CatalogueGroup =>
  ({
    key,
    title: key,
    servers: [],
    platformAdministration: [],
    workflows: [],
    ...parts,
  }) as CatalogueGroup;

const CATALOGUE: CatalogueGroup[] = [
  group('infrastructure', {
    servers: [
      bucket('kubernetes', [tool('get', true), tool('delete', false)]),
      bucket('pro', [], true),
    ],
  }),
  group('agent-platform', {
    servers: [bucket('agent-manager', [tool('create')])],
    platformAdministration: [tool('core_service_list')],
  }),
  group('workflows', { workflows: [tool('workflow_triage', true)] }),
];

describe('catalogueEffect', () => {
  it('counts what reads and what changes things, unannotated as changing', () => {
    expect(effectCounts(CATALOGUE)).toEqual({ reads: 2, changes: 3 });
  });

  it('keeps the grouping and drops what holds nothing of the kind', () => {
    const reads = filterCatalogueByEffect(CATALOGUE, 'reads');
    expect(reads.map(g => g.key)).toEqual(['infrastructure', 'workflows']);
    // The sign-in-gated server has no known tools, so it is not a read.
    expect(reads[0].servers.map(s => s.name)).toEqual(['kubernetes']);
    expect(reads[0].servers[0].tools.map(t => t.name)).toEqual(['get']);

    const changes = filterCatalogueByEffect(CATALOGUE, 'changes');
    expect(changes.map(g => g.key)).toEqual([
      'infrastructure',
      'agent-platform',
    ]);
    expect(changes[1].platformAdministration).toHaveLength(1);

    expect(filterCatalogueByEffect(CATALOGUE, 'all')).toBe(CATALOGUE);
  });

  it('offers the filter only when both kinds exist, or while one is picked', () => {
    expect(effectDimension(CATALOGUE, CATALOGUE, 'all')).toEqual({
      id: 'effect',
      label: 'What it does',
      options: [
        { id: 'reads', label: 'Reads', count: 2 },
        { id: 'changes', label: 'Changes things', count: 3 },
      ],
      selected: [],
    });

    const onlyReads = filterCatalogueByEffect(CATALOGUE, 'reads');
    expect(effectDimension(onlyReads, onlyReads, 'all')).toBeUndefined();
    // A pick stays undoable, counted over the searched catalogue.
    expect(effectDimension(onlyReads, onlyReads, 'reads')).toMatchObject({
      selected: ['reads'],
      options: [
        { id: 'reads', label: 'Reads', count: 2 },
        { id: 'changes', label: 'Changes things', count: 0 },
      ],
    });
  });

  it('reads one picked kind as that kind, none or both as everything', () => {
    expect(effectFromPicks(['reads'])).toBe('reads');
    expect(effectFromPicks(['changes'])).toBe('changes');
    expect(effectFromPicks([])).toBe('all');
    expect(effectFromPicks(['reads', 'changes'])).toBe('all');
  });

  it('counts the tools of a resolved toolset that change things', () => {
    expect(
      changingToolCount([tool('a', true), tool('b', false), tool('c')]),
    ).toBe(2);
    expect(changingToolCount([])).toBe(0);
  });
});
