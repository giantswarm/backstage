import {
  CUSTOM_KIND,
  DeclarationForm,
  EMPTY,
  fixOf,
  hasCIJob,
  isComplete,
  kindOf,
  KINDS,
  nameProblem,
  toEntry,
  withGen,
  withKind,
} from './declaration';

const form = (changes: Partial<DeclarationForm> = {}): DeclarationForm => ({
  ...EMPTY,
  team: 'team-bumblebee',
  ...changes,
});

describe('EMPTY', () => {
  it('opens as a Go service with the CircleCI generator on', () => {
    expect(kindOf(EMPTY)).toBe('go-service');
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

describe('isComplete', () => {
  it('needs a team and a name that follows the rule', () => {
    expect(isComplete(form({ name: '' }))).toBe(false);
    expect(isComplete(form({ name: 'shiny', team: '' }))).toBe(false);
    expect(isComplete(form({ name: 'Shiny' }))).toBe(false);
    expect(isComplete(form({ name: 'shiny' }))).toBe(true);
  });
});

describe('kinds', () => {
  it('every kind is recognised from its own fields', () => {
    KINDS.forEach(kind => {
      expect(kindOf(withKind(EMPTY, kind.id))).toBe(kind.id);
    });
  });

  it('withKind sets the fields and the CircleCI switch where the kind has a job', () => {
    const configuration = withKind(EMPTY, 'configuration');
    expect(configuration).toMatchObject({
      componentType: 'configuration',
      language: 'generic',
      flavours: ['generic'],
      ciGenerate: false,
    });
    expect(withKind(configuration, 'chart-app')).toMatchObject({
      componentType: 'service',
      language: 'generic',
      flavours: ['app'],
      ciGenerate: true,
    });
    expect(withKind(EMPTY, 'go-library').ciGenerate).toBe(true);
    expect(withKind(EMPTY, 'customer').ciGenerate).toBe(false);
  });

  it('withKind with Custom or an unknown id changes nothing', () => {
    expect(withKind(EMPTY, CUSTOM_KIND)).toEqual(EMPTY);
    expect(withKind(EMPTY, 'no-such-kind')).toEqual(EMPTY);
  });

  it('fields matching no kind read as Custom, in any flavour order', () => {
    expect(kindOf(form({ flavours: ['app', 'cli'] }))).toBe(CUSTOM_KIND);
    expect(kindOf(form({ componentType: 'library' }))).toBe(CUSTOM_KIND);
    expect(
      kindOf(
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
