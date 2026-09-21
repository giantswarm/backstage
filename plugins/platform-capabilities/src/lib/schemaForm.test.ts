import { AGENT_PLATFORM_DEFINITION, RECORD } from '../fixtures/fakeApi';
import {
  choiceLabel,
  choiceValue,
  fieldsOf,
  formOf,
  initialValues,
  missingRequired,
  parseValue,
  personChoices,
  setAt,
} from './schemaForm';

const schema = AGENT_PLATFORM_DEFINITION.inputSchema!;

describe('schemaForm', () => {
  it('turns the definition schema into groups and fields in the schema order', () => {
    const form = formOf(schema);
    expect(form.groups.map(g => g.title)).toEqual([
      'installation',
      'kagent',
      'portal',
      'federation',
      'modelServing',
    ]);
    expect(fieldsOf(form).map(f => `${f.name}:${f.kind}`)).toEqual([
      'installation.name:string',
      'installation.baseDomain:string',
      'installation.private:boolean',
      'installation.chartLine:enum',
      'kagent.enabled:boolean',
      'portal.enabled:boolean',
      'federation.targets:strings',
      'modelServing.enabled:boolean',
    ]);
    expect(
      fieldsOf(form).find(f => f.name === 'kagent.enabled')?.required,
    ).toBe(true);
    expect(
      fieldsOf(form).find(f => f.name === 'installation.chartLine')?.options,
    ).toEqual(['3', '4']);
  });

  it('prefills the record and the schema defaults, and chooses nothing else', () => {
    const form = formOf(schema);
    const values = initialValues(form, schema, { installation: RECORD });
    expect(values).toEqual({
      installation: {
        name: 'rowan',
        baseDomain: 'rowan.example.test',
        private: false,
        chartLine: '4',
      },
      modelServing: { enabled: false },
    });
    expect(missingRequired(form, values)).toEqual([
      'kagent.enabled',
      'portal.enabled',
    ]);
  });

  it('names the choices a person makes, with their values as one word', () => {
    const choices = personChoices(schema);
    expect(choices.map(f => f.name)).toEqual(['modelServing.enabled']);
    const [serving] = choices;
    expect(choiceLabel(serving)).toBe('Model serving');
    expect(choiceValue(serving, true)).toBe('on');
    expect(choiceValue(serving, false)).toBe('off');
    expect(
      choiceLabel({ ...serving, path: ['gpu', 'nodes'], title: 'nodes' }),
    ).toBe('Nodes');
    expect(
      choiceLabel({ ...serving, path: ['gpu'], title: 'GPU node pool' }),
    ).toBe('GPU node pool');
  });

  it('sets and clears leaves, pruning empty groups', () => {
    let values = setAt({}, ['kagent', 'enabled'], true);
    expect(values).toEqual({ kagent: { enabled: true } });
    values = setAt(values, ['kagent', 'enabled'], undefined);
    expect(values).toEqual({});
  });

  it('parses what the person typed by the field kind, an empty input meaning "left out"', () => {
    const fields = fieldsOf(formOf(schema));
    const by = (name: string) => fields.find(f => f.name === name)!;
    expect(parseValue(by('kagent.enabled'), 'true')).toBe(true);
    expect(parseValue(by('kagent.enabled'), '')).toBeUndefined();
    expect(parseValue(by('federation.targets'), 'a, b ,')).toEqual(['a', 'b']);
    expect(parseValue(by('installation.baseDomain'), ' x.test ')).toBe(
      'x.test',
    );
  });
});
