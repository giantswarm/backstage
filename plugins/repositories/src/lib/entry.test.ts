import { editedEntry, fromEntry, keptFields } from './entry';

/** An entry as a team file holds one: the form's fields, and others beside them at every level. */
const entry = {
  name: 'present-service',
  componentType: 'service',
  system: 'agent-platform',
  choreReviewers: ['alice'],
  gen: {
    language: 'go',
    flavours: ['app'],
    preCommit: ['go'],
    ci: {
      generate: true,
      appCatalog: 'giantswarm',
      image: { dockerfile: 'build/Dockerfile' },
    },
  },
  visibility: 'public',
};

describe('fromEntry', () => {
  it('reads the fields the form carries, and the team whose file declares the entry', () => {
    expect(fromEntry(entry, 'team-bumblebee')).toEqual({
      team: 'team-bumblebee',
      name: 'present-service',
      componentType: 'service',
      language: 'go',
      flavours: ['app'],
      description: '',
      visibility: 'public',
      ciGenerate: true,
      align: false,
      reason: '',
    });
  });

  it('reads a bare entry as unset: no language, no flavours, the generator off, not opted in', () => {
    expect(
      fromEntry({ name: 'x', gen: { flavours: 'app' } }, 'team-x'),
    ).toEqual({
      team: 'team-x',
      name: 'x',
      componentType: '',
      language: '',
      flavours: [],
      description: '',
      visibility: '',
      ciGenerate: false,
      align: false,
      reason: '',
    });
  });
});

describe('editedEntry', () => {
  it('replaces the form’s fields and keeps every other field of the entry, at every level', () => {
    const form = {
      ...fromEntry(entry, 'team-bumblebee'),
      language: 'generic',
      description: 'Serves the present',
      visibility: '',
      align: true,
      reason: 'built elsewhere now',
    };
    expect(editedEntry(entry, form)).toEqual({
      name: 'present-service',
      componentType: 'service',
      system: 'agent-platform',
      choreReviewers: ['alice'],
      gen: {
        language: 'generic',
        flavours: ['app'],
        preCommit: ['go'],
        ci: {
          generate: true,
          appCatalog: 'giantswarm',
          image: { dockerfile: 'build/Dockerfile' },
        },
      },
      description: 'Serves the present',
      align: true,
    });
  });

  it('leaves align out of an entry that never had it, and keeps a written align written', () => {
    const form = fromEntry(entry, 'team-bumblebee');
    expect(editedEntry(entry, form)).not.toHaveProperty('align');
    expect(editedEntry({ ...entry, align: false }, form)).toHaveProperty(
      'align',
      false,
    );
    // Opted out on the form: the entry says so rather than falling silent.
    expect(editedEntry({ ...entry, align: true }, form)).toHaveProperty(
      'align',
      false,
    );
  });

  it('writes gen.ci.generate out for an entry without gen, the way the Create form does', () => {
    const bare = {
      name: 'x',
      componentType: 'library',
      lifecycle: 'deprecated',
    };
    expect(editedEntry(bare, fromEntry(bare, 'team-x'))).toEqual({
      name: 'x',
      componentType: 'library',
      lifecycle: 'deprecated',
      gen: { ci: { generate: false } },
    });
  });
});

describe('keptFields', () => {
  it('names the fields the form does not carry, dotted', () => {
    expect(keptFields(entry)).toEqual([
      'system',
      'choreReviewers',
      'gen.preCommit',
      'gen.ci.appCatalog',
      'gen.ci.image',
    ]);
    expect(keptFields({ name: 'x', gen: { language: 'go' } })).toEqual([]);
  });
});
