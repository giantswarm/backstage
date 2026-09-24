import { ManagerSchema } from '../apis';
import { schema } from '../fixtures/records';
import {
  Addon,
  addonAllowed,
  addonsOf,
  DeclarationForm,
  EMPTY,
  fixOf,
  flavourProblem,
  hasCIJob,
  isComplete,
  nameProblem,
  natureOf,
  presetOf,
  PRESETS,
  presetsOf,
  toEntry,
  Vocabulary,
  vocabularyOf,
  withAddons,
  withGen,
  withNature,
  withPreset,
} from './declaration';

/** The vocabulary a manager reporting this schema offers. */
function vocabularyFor(reported: Partial<ManagerSchema> = {}): Vocabulary {
  const result = vocabularyOf({
    version: 'v0.30.0',
    schema: { ...schema, ...reported },
  });
  if (!('vocabulary' in result)) {
    throw new Error(result.problem);
  }
  return result.vocabulary;
}

const reported = vocabularyFor();
const ids = (choices: { id: string }[]) => choices.map(choice => choice.id);

const form = (changes: Partial<DeclarationForm> = {}): DeclarationForm => ({
  ...EMPTY,
  team: 'team-bumblebee',
  ...changes,
});

describe('EMPTY', () => {
  it('opens as a Go service with the CircleCI generator on', () => {
    expect(presetOf(EMPTY)).toBe('go-service');
    expect(EMPTY.ciGenerate).toBe(true);
    expect(EMPTY.visibility).toBe('');
  });
});

describe('toEntry', () => {
  it('builds the entry as the team file takes it, leaves empty fields out and writes gen.ci.generate out', () => {
    expect(
      toEntry(
        form({
          name: ' x ',
          componentType: '',
          language: 'go',
          flavours: ['app', ' ', 'cli'],
          visibility: 'public',
        }),
      ),
    ).toEqual({
      name: 'x',
      gen: { language: 'go', flavours: ['app', 'cli'], ci: { generate: true } },
      visibility: 'public',
    });
  });

  it('writes gen.ci.generate: false when the CircleCI generator is off, as devctl repo create does', () => {
    expect(
      toEntry(
        form({
          name: 'configs',
          componentType: 'configuration',
          language: 'generic',
          flavours: ['generic'],
          ciGenerate: false,
        }),
      ),
    ).toEqual({
      name: 'configs',
      componentType: 'configuration',
      gen: {
        language: 'generic',
        flavours: ['generic'],
        ci: { generate: false },
      },
    });
  });
});

describe('fixOf', () => {
  it('reads the value the refusal of gen.ci.generate tells the person to set', () => {
    expect(
      fixOf({
        field: 'gen.ci.generate',
        message: 'no CircleCI job for language generic …; set it to false',
      }),
    ).toEqual({ ciGenerate: false });
  });

  it('offers nothing for a text field or a refusal that names no value', () => {
    expect(fixOf({ field: 'name', message: 'exists already' })).toBeUndefined();
    expect(
      fixOf({ field: 'gen.ci.generate', message: 'must be a boolean' }),
    ).toBeUndefined();
  });
});

describe('hasCIJob', () => {
  it('has a job for a Go or Node build and for the app flavour, as the engine judges it', () => {
    expect(hasCIJob('go', ['generic'])).toBe(true);
    expect(hasCIJob('node', ['generic'])).toBe(true);
    expect(hasCIJob('generic', ['app'])).toBe(true);
    expect(hasCIJob('generic', ['generic'])).toBe(false);
    expect(hasCIJob('python', ['cli'])).toBe(false);
    expect(hasCIJob('generic', ['customer'])).toBe(false);
  });
});

describe('nameProblem', () => {
  it('accepts the repository name rule and refuses the rest in the engine’s words', () => {
    expect(nameProblem('shiny_service.v2', ['generic'])).toBeUndefined();
    expect(nameProblem('Shiny', ['generic'])).toMatch(/must be lowercase/);
    expect(nameProblem('-shiny', ['generic'])).toMatch(
      /starting with a letter/,
    );
  });

  it('holds a chart repository to the chart’s name, without the -app suffix', () => {
    expect(nameProblem('shiny', ['app'])).toBeUndefined();
    expect(nameProblem('shiny_service', ['app'])).toMatch(
      /the chart is named after the repository/,
    );
    expect(nameProblem('shiny-', ['cluster-app'])).toMatch(/ending with/);
    expect(nameProblem('shiny-app', ['app'])).toBe(
      'a chart repository is named after its chart, without the -app suffix',
    );
  });

  it('says nothing about an empty name', () => {
    expect(nameProblem('', ['app'])).toBeUndefined();
  });
});

describe('flavourProblem', () => {
  it('holds the cli flavour to Go, as devctl’s Makefile generator does', () => {
    expect(flavourProblem('go', ['cli'])).toBeUndefined();
    expect(flavourProblem('python', ['app'])).toBeUndefined();
    expect(flavourProblem('python', ['cli'])).toBe(
      'flavour cli is supported only for language go: pick go, or another nature',
    );
  });
});

describe('isComplete', () => {
  it('needs a team and a name that follows the rule', () => {
    expect(isComplete(form({ name: '' }))).toBe(false);
    expect(isComplete(form({ name: 'shiny', team: '' }))).toBe(false);
    expect(isComplete(form({ name: 'Shiny' }))).toBe(false);
    expect(isComplete(form({ name: 'shiny' }))).toBe(true);
  });

  it('waits while the flavours break the generator’s rule', () => {
    expect(
      isComplete(
        form({ name: 'shiny', language: 'python', flavours: ['cli'] }),
      ),
    ).toBe(false);
  });
});

describe('vocabularyOf', () => {
  it('offers the reported values, the described ones in the presentation’s order', () => {
    expect(ids(reported.componentTypes)).toEqual([
      'service',
      'library',
      'cli',
      'configuration',
      'customer',
      'template',
      'appcatalog',
      'unspecified',
    ]);
    expect(ids(reported.languages)).toEqual([
      'generic',
      'go',
      'python',
      'node',
      'kyverno-policy',
    ]);
    expect(ids(reported.visibilities)).toEqual(['private', 'public']);
  });

  it('groups the flavours into natures and add-ons, not fork, which a new repository cannot be', () => {
    expect(ids(reported.natures)).toEqual([
      'app',
      'generic',
      'cli',
      'customer',
      'fleet',
    ]);
    expect(ids(reported.addons)).toEqual(['cluster-app', 'k8sapi', 'plans']);
  });

  it('offers a reported value it has no text for under its own id, and drops one no longer reported', () => {
    const vocabulary = vocabularyFor({
      languages: ['go', 'rust'],
      flavours: ['app', 'generic', 'wasm'],
    });
    expect(ids(vocabulary.languages)).toEqual(['go', 'rust']);
    expect(vocabulary.languages[1]).toMatchObject({
      id: 'rust',
      label: 'rust',
    });
    expect(ids(vocabulary.natures)).toEqual(['app', 'generic']);
    expect(ids(vocabulary.addons)).toEqual(['wasm']);
  });

  it('says why without a schema, with the manager’s error, or with a list missing; it has no fallback', () => {
    expect(vocabularyOf({ version: 'v0.29.0' })).toEqual({
      problem: expect.stringContaining(
        'giantswarm-repo-manager v0.29.0 does not report the repositories schema',
      ),
    });
    expect(
      vocabularyOf({
        version: 'v0.30.0',
        schema: { origin: 'embedded', error: 'no gen.flavours enum' },
      }),
    ).toEqual({
      problem:
        'giantswarm-repo-manager could not read the repositories schema (embedded): no gen.flavours enum',
    });
    expect(
      vocabularyOf({
        version: 'v0.30.0',
        schema: { ...schema, languages: [] },
      }),
    ).toEqual({ problem: expect.stringContaining('reports no languages') });
  });
});

describe('flavours', () => {
  it('reads the nature and the add-ons off the flavours in any order', () => {
    expect(natureOf(['cluster-app', 'app'], reported)).toBe('app');
    expect(natureOf(['k8sapi'], reported)).toBeUndefined();
    expect(addonsOf(['app', 'cluster-app', 'k8sapi'], reported)).toEqual([
      'cluster-app',
      'k8sapi',
    ]);
  });

  it('withNature keeps the add-ons that go with the new nature and drops the rest', () => {
    const app = withAddons(
      withNature(EMPTY, 'app', reported),
      ['cluster-app', 'k8sapi'],
      reported,
    );
    expect(app.flavours).toEqual(['app', 'cluster-app', 'k8sapi']);
    expect(withNature(app, 'generic', reported)).toMatchObject({
      flavours: ['generic', 'k8sapi'],
      ciGenerate: true,
    });
    expect(
      withNature(withGen(app, { language: 'generic' }), 'customer', reported),
    ).toMatchObject({ flavours: ['customer', 'k8sapi'], ciGenerate: false });
  });

  it('holds the plans add-on to the generic nature', () => {
    const plans = reported.addons.find(addon => addon.id === 'plans') as Addon;
    expect(addonAllowed(plans, 'generic')).toBe(true);
    expect(addonAllowed(plans, 'app')).toBe(false);
    const generic = withAddons(
      withNature(EMPTY, 'generic', reported),
      ['plans'],
      reported,
    );
    expect(generic.flavours).toEqual(['generic', 'plans']);
    expect(withNature(generic, 'app', reported).flavours).toEqual(['app']);
  });

  it('withAddons sets the add-ons after the nature and re-derives the CircleCI switch', () => {
    const configuration = withPreset(EMPTY, 'configuration');
    expect(withAddons(configuration, ['k8sapi'], reported)).toMatchObject({
      flavours: ['generic', 'k8sapi'],
      ciGenerate: false,
    });
    expect(withAddons(configuration, [], reported).flavours).toEqual([
      'generic',
    ]);
  });

  it('keeps a fork line’s fork flavour, which the form does not offer', () => {
    const fork = form({ flavours: ['generic', 'fork'] });
    expect(withAddons(fork, ['k8sapi'], reported).flavours).toEqual([
      'generic',
      'k8sapi',
      'fork',
    ]);
    expect(withNature(fork, 'app', reported).flavours).toEqual(['app', 'fork']);
  });
});

describe('presets', () => {
  it('offers every preset the report can declare', () => {
    expect(ids(presetsOf(reported))).toEqual(ids(PRESETS));
  });

  it('does not offer a preset whose values the manager does not report', () => {
    const withoutPlans = presetsOf(
      vocabularyFor({ flavours: ['app', 'cli', 'customer', 'generic'] }),
    );
    expect(ids(withoutPlans)).not.toContain('plans');
    expect(ids(withoutPlans)).toContain('other');
    expect(
      ids(presetsOf(vocabularyFor({ languages: ['generic'] }))),
    ).not.toContain('go-service');
  });

  it('every preset is recognised from its own fields', () => {
    PRESETS.forEach(preset => {
      expect(presetOf(withPreset(EMPTY, preset.id))).toBe(preset.id);
    });
  });

  it('withPreset sets the fields and the CircleCI switch where the preset has a job', () => {
    const configuration = withPreset(EMPTY, 'configuration');
    expect(configuration).toMatchObject({
      componentType: 'configuration',
      language: 'generic',
      flavours: ['generic'],
      ciGenerate: false,
    });
    expect(withPreset(configuration, 'chart-app')).toMatchObject({
      componentType: 'service',
      language: 'generic',
      flavours: ['app'],
      ciGenerate: true,
    });
    expect(withPreset(EMPTY, 'go-library').ciGenerate).toBe(true);
    expect(withPreset(EMPTY, 'customer').ciGenerate).toBe(false);
    expect(withPreset(EMPTY, 'plans')).toMatchObject({
      componentType: 'unspecified',
      language: 'generic',
      flavours: ['generic', 'plans'],
      ciGenerate: false,
    });
  });

  it('withPreset with an unknown id changes nothing', () => {
    expect(withPreset(EMPTY, 'no-such-preset')).toEqual(EMPTY);
  });

  it('fields matching no preset read as none, in any flavour order', () => {
    expect(presetOf(form({ flavours: ['app', 'cli'] }))).toBeUndefined();
    expect(presetOf(form({ componentType: 'library' }))).toBeUndefined();
    expect(
      presetOf(
        form({
          componentType: 'service',
          language: 'generic',
          flavours: ['app'],
        }),
      ),
    ).toBe('chart-app');
  });

  it('withGen re-derives the CircleCI switch from the new language and flavours', () => {
    const generic = withGen(EMPTY, { language: 'generic', flavours: ['cli'] });
    expect(generic.ciGenerate).toBe(false);
    expect(withGen(generic, { flavours: ['cli', 'app'] }).ciGenerate).toBe(
      true,
    );
    expect(withGen(generic, { componentType: 'cli' }).ciGenerate).toBe(false);
  });
});
