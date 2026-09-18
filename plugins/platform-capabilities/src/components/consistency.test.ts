import { VerifyFeature } from '../apis';
import { cellOf, countMarks, flattenInputs, rollUp } from './consistency';

describe('rollUp', () => {
  it('is the manager’s: drifted > differs by input > as defined, not checked never taints', () => {
    expect(rollUp(['as defined', 'drifted', 'differs by input'])).toBe(
      'drifted',
    );
    expect(rollUp(['as defined', 'differs by input'])).toBe('differs by input');
    expect(rollUp(['not checked', 'as defined'])).toBe('as defined');
    expect(rollUp(['not checked', 'not checked'])).toBe('not checked');
    expect(rollUp([])).toBe('not checked');
  });
});

describe('cellOf', () => {
  const feature: VerifyFeature = {
    id: 'identity',
    mark: 'drifted',
    dimensions: [
      { id: 'dex-clients', kind: 'dex-secret', mark: 'as defined' },
      { id: 'dex-auth-request', kind: 'probe', mark: 'drifted' },
      {
        id: 'live-dex',
        kind: 'live',
        mark: 'not checked',
        reason: 'authority',
      },
    ],
  };

  it('shows the manager’s mark and dimensions for a readable installation', () => {
    expect(cellOf(feature, true)).toEqual({
      mark: 'drifted',
      dimensions: feature.dimensions,
    });
  });

  it('shows the live dimensions as not readable and rolls the files up alone', () => {
    const cell = cellOf(feature, false);
    expect(cell.mark).toBe('as defined');
    expect(cell.dimensions.map(d => [d.id, d.mark])).toEqual([
      ['dex-clients', 'as defined'],
      ['dex-auth-request', 'not readable'],
      ['live-dex', 'not readable'],
    ]);
    expect(cell.dimensions[1].reason).toMatch(/cannot be read as you/);
  });

  it('is not readable as a whole when only live dimensions could have said anything', () => {
    const probesOnly: VerifyFeature = {
      id: 'tool-access',
      mark: 'drifted',
      dimensions: [{ id: 'metadata', kind: 'probe', mark: 'drifted' }],
    };
    expect(cellOf(probesOnly, false).mark).toBe('not readable');
    const filesUnchecked: VerifyFeature = {
      id: 'runtime',
      mark: 'drifted',
      dimensions: [
        { id: 'patch', kind: 'configmap', mark: 'not checked', reason: '403' },
        { id: 'live-drift', kind: 'live', mark: 'drifted' },
      ],
    };
    expect(cellOf(filesUnchecked, false).mark).toBe('not readable');
  });

  it('leaves a feature without live dimensions alone, readable or not', () => {
    const files: VerifyFeature = {
      id: 'secrets',
      mark: 'differs by input',
      dimensions: [{ id: 'shapes', kind: 'extras', mark: 'differs by input' }],
    };
    expect(cellOf(files, false)).toEqual({
      mark: 'differs by input',
      dimensions: files.dimensions,
    });
    expect(cellOf({ id: 'empty', mark: 'not checked' }, false).mark).toBe(
      'not checked',
    );
  });
});

describe('countMarks', () => {
  it('counts the cells per mark', () => {
    expect(
      countMarks([
        { mark: 'drifted', dimensions: [] },
        { mark: 'drifted', dimensions: [] },
        { mark: 'not readable', dimensions: [] },
      ]),
    ).toEqual({ drifted: 2, 'not readable': 1 });
  });
});

describe('flattenInputs', () => {
  it('lists the leaves with dotted names, arrays joined, undefined left out', () => {
    expect(
      flattenInputs({
        installation: { name: 'rowan', private: false, customer: undefined },
        federation: { targets: ['hazel', 'birch'] },
        kagent: { enabled: true, model: null },
      }),
    ).toEqual([
      ['installation.name', 'rowan'],
      ['installation.private', 'false'],
      ['federation.targets', 'hazel, birch'],
      ['kagent.enabled', 'true'],
      ['kagent.model', 'null'],
    ]);
    expect(flattenInputs(undefined)).toEqual([]);
  });
});
