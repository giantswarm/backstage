import {
  AGENT_PLATFORM_DEFINITION,
  CUSTOMER_PORTAL_DEFINITION,
  PORTAL_ON_RECORD,
  VERIFIED,
} from '../fixtures/fakeApi';
import {
  choiceLabel,
  choiceValue,
  fieldsOf,
  formOf,
  initialValues,
  labelOf,
  missingRequired,
  parseValue,
  personChoices,
  personForm,
  setAt,
} from './schemaForm';

const schema = AGENT_PLATFORM_DEFINITION.inputSchema!;

describe('schemaForm', () => {
  it('turns the definition schema into groups and fields in the schema order', () => {
    const form = formOf(schema);
    expect(form.groups.map(g => g.title)).toEqual([
      'Installation',
      'Kagent',
      'Portal',
      'Federation',
      'Model serving',
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

  it("asks the person's choices only: the leaves marked person, in their groups", () => {
    const asked = personForm(formOf(CUSTOMER_PORTAL_DEFINITION.inputSchema!));
    // The record's facts, the generated key and the supplied app id are the
    // manager's; the portal's friendly labels are a list of objects the form
    // has no field for.
    expect(asked.groups.map(g => g.title)).toEqual([
      'Portal',
      'Chart',
      'Plugins',
      'Tunnel',
    ]);
    expect(fieldsOf(asked).map(f => f.name)).toEqual([
      'portal.domain',
      'portal.title',
      'portal.organization',
      'portal.supportUrl',
      'chart.line',
      'plugins.github.enabled',
      'plugins.grafana.enabled',
      'plugins.sentry.enabled',
      'tunnel.enabled',
    ]);
    expect(personChoices(schema).map(f => f.name)).toEqual([
      'kagent.enabled',
      'portal.enabled',
      'modelServing.enabled',
    ]);
  });

  it("opens with the comparison's values for its fields and never a schema default", () => {
    const asked = personForm(formOf(schema));
    expect(initialValues(asked, VERIFIED.inputs!.values)).toEqual({
      kagent: { enabled: true },
      modelServing: { enabled: false },
    });
    // modelServing.enabled defaults to false in the schema: without a
    // comparison the form holds nothing, and the manager applies the default.
    expect(initialValues(asked)).toEqual({});
    expect(missingRequired(asked, {}).map(f => f.name)).toEqual([
      'kagent.enabled',
      'portal.enabled',
    ]);

    const portal = personForm(formOf(CUSTOMER_PORTAL_DEFINITION.inputSchema!));
    const values = initialValues(portal, PORTAL_ON_RECORD.inputs!.values);
    // The registry's facts and the supplied app id are not the form's.
    expect(values).toEqual({
      portal: {
        domain: 'portal.rowan.example.test',
        title: 'Backstage',
        organization: 'Example',
      },
      chart: { line: '>=1.0.0 <2.0.0' },
      plugins: {
        github: { enabled: true },
        grafana: { enabled: false },
        sentry: { enabled: true },
      },
    });
    expect(missingRequired(portal, values).map(f => f.name)).toEqual([
      'tunnel.enabled',
    ]);
  });

  it('names the choices a person makes, with their values as one word', () => {
    const serving = personChoices(schema).find(
      f => f.name === 'modelServing.enabled',
    )!;
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

  it('labels a field by its group where two share a label, a list or unknown field by its key', () => {
    const choices = personChoices({
      type: 'object',
      properties: {
        portal: {
          type: 'object',
          properties: {
            domain: { type: 'string', 'x-source': 'person' },
            supportUrl: { type: 'string', 'x-source': 'person' },
            friendlyLabels: {
              type: 'array',
              items: { type: 'object' },
              'x-source': 'person',
            },
          },
        },
        grafana: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', 'x-source': 'person' },
            domain: { type: 'string', 'x-source': 'person' },
          },
        },
      },
    });
    expect(labelOf('portal.supportUrl', choices)).toBe('Support url');
    expect(labelOf('portal.domain', choices)).toBe('Portal domain');
    expect(labelOf('grafana.domain', choices)).toBe('Grafana domain');
    expect(labelOf('grafana.enabled', choices)).toBe('Grafana');
    // A list of objects is no field of the form; it is named by its key.
    expect(labelOf('portal.friendlyLabels', choices)).toBe('Friendly labels');
    // So is a field the schema does not know; one whose key another choice
    // is called by is qualified with its group too.
    expect(labelOf('federation.tokenBroker', choices)).toBe('Token broker');
    expect(labelOf('flux.domain', choices)).toBe('Flux domain');
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
