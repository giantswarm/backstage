import { DeclarationEntry } from '../apis';
import { DeclarationForm, toEntry } from './declaration';

/**
 * An existing team-file entry and the form: the form reads the fields it
 * has a control for off the entry, and the edit writes them back into the
 * entry whole -- `update_repository` takes the entry as it should read
 * afterwards, not a patch -- with every other field as it was.
 */

/** The entry's fields the form carries, per level; the rest is kept. */
const FORM_FIELDS = [
  'name',
  'componentType',
  'description',
  'visibility',
  'align',
];
const FORM_GEN_FIELDS = ['language', 'flavours'];
const FORM_CI_FIELDS = ['generate'];

type Fields = Record<string, unknown>;

const fieldsOf = (value: unknown): Fields =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Fields)
    : {};

const stringOf = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const without = (fields: Fields, keys: string[]): Fields =>
  Object.fromEntries(
    Object.entries(fields).filter(([key]) => !keys.includes(key)),
  );

/**
 * The form for an entry: its values where the form has a field -- an unset
 * `gen.ci.generate` reads as off, the way align-files reads it; an unset
 * `align` as not opted in -- and the team whose file declares it.
 */
export function fromEntry(
  entry: DeclarationEntry,
  team: string,
): DeclarationForm {
  const gen = fieldsOf(entry.gen);
  const ci = fieldsOf(gen.ci);
  return {
    team,
    name: entry.name,
    componentType: stringOf(entry.componentType),
    language: stringOf(gen.language),
    flavours: stringsOf(gen.flavours),
    description: stringOf(entry.description),
    visibility: stringOf(entry.visibility),
    ciGenerate: ci.generate === true,
    align: entry.align === true,
    reason: '',
  };
}

/**
 * The entry as it should read after the edit: the form's fields replace the
 * entry's -- a field emptied on the form leaves the entry -- and every field
 * the form does not carry (lifecycle, system, choreReviewers, the knobs
 * under gen and gen.ci, …) stays as it was. An `align` the entry writes
 * stays written, true or false; an entry without it gains it when opted in.
 */
export function editedEntry(
  entry: DeclarationEntry,
  form: DeclarationForm,
): DeclarationEntry {
  const edited = toEntry(form);
  const gen = fieldsOf(entry.gen);
  const editedGen = fieldsOf(edited.gen);
  return {
    ...without(entry, FORM_FIELDS),
    ...edited,
    ...('align' in entry && !form.align && { align: false }),
    gen: {
      ...without(gen, [...FORM_GEN_FIELDS, 'ci']),
      ...without(editedGen, ['ci']),
      ci: {
        ...without(fieldsOf(gen.ci), FORM_CI_FIELDS),
        ...fieldsOf(editedGen.ci),
      },
    },
  };
}

/**
 * The entry's fields the form does not carry, dotted the way the manager's
 * refusals name them (`lifecycle`, `gen.preCommit`, `gen.ci.appCatalog`):
 * what the edit keeps as it is, named on the form.
 */
export function keptFields(entry: DeclarationEntry): string[] {
  const gen = fieldsOf(entry.gen);
  return [
    ...Object.keys(without(entry, [...FORM_FIELDS, 'gen'])),
    ...Object.keys(without(gen, [...FORM_GEN_FIELDS, 'ci'])).map(
      key => `gen.${key}`,
    ),
    ...Object.keys(without(fieldsOf(gen.ci), FORM_CI_FIELDS)).map(
      key => `gen.ci.${key}`,
    ),
  ];
}
