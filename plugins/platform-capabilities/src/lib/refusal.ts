import { VerifyResult } from '../apis';
import { Field, fieldsNamed } from './schemaForm';

/** How a refusal reads: for an input the dialog can supply, or for something to fix first. */
export type RefusalStatus = 'info' | 'warning';

type Refusal = Pick<VerifyResult, 'refused' | 'commitRefused' | 'inputs'>;

/**
 * The manager's reason, in its words: the definition's refusal of the
 * inputs where there is one, else why a commit would be refused. The
 * manager copies the first into the second, so a page reads one, never both.
 */
export function reasonOf(result?: Refusal): string | undefined {
  return result?.refused ?? result?.commitRefused;
}

/** An input a person gives: a choice of the form, or a value supplied at commit. */
function givenByPerson(field: Field): boolean {
  return field.source === 'person' || field.source === 'supplied';
}

/**
 * `info` where the reason is an input the dialog can supply -- a key the
 * sentence names that a person gives, or, short of a definition refusal,
 * the required choices no layer holds (`inputs.missing`) -- so the way to
 * the dialog stays open; `warning` where something is fixed first: a fact
 * of the record, a file on record, a version. `fields` are every leaf of
 * the definition's schema, the ones the manager reads included.
 */
export function refusalStatus(result: Refusal, fields: Field[]): RefusalStatus {
  const named = fieldsNamed(reasonOf(result) ?? '', fields).some(givenByPerson);
  const missing = !result.refused && (result.inputs?.missing?.length ?? 0) > 0;
  return named || missing ? 'info' : 'warning';
}
