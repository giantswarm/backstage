import { Fact } from '@giantswarm/backstage-plugin-ui-react';
import { Action } from '../apis';
import { choiceValue, Field, labelOf } from './schemaForm';

/** The page's verb for each kind of action; the manager's `reconcile` never appears on the tab. */
const VERBS: Record<Action['spec']['kind'], string> = {
  enable: 'enable',
  reconcile: 'apply changes to',
};

/**
 * The kind of an action from its name: the manager names an action
 * `<kind>-<installation>-<suffix>`, so the kind is the first segment. A
 * capability's `lastAction` carries the name and the state alone.
 */
export function kindOf(name: string): Action['spec']['kind'] {
  return name.startsWith('reconcile') ? 'reconcile' : 'enable';
}

/** The verb the page uses for an action of this kind, to lead its line: `enable agent-platform`. */
export function verbOf(kind: Action['spec']['kind']): string {
  return VERBS[kind];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A value the definition's schema does not describe, as text: a switch as on or off, a list joined, a structure as JSON. */
function plainValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off';
  }
  if (Array.isArray(value) && value.every(v => !isRecord(v))) {
    return value.join(', ');
  }
  if (isRecord(value) || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * What an action asked for, as facts: every leaf of `spec.inputs` by its
 * dotted path, labelled as the definition's form labels the same choice
 * where `fields` (the schema's leaves) know it, and its value in the same
 * words the card's record uses. A leaf the schema does not describe keeps
 * its path's last word as the label and its value as text.
 */
export function inputFacts(
  inputs: Record<string, unknown> | undefined,
  fields: Field[],
): Fact[] {
  const facts: Fact[] = [];
  const walk = (value: unknown, path: string[]) => {
    const name = path.join('.');
    const field = fields.find(f => f.name === name);
    if (!field && isRecord(value)) {
      for (const [key, inner] of Object.entries(value)) {
        walk(inner, [...path, key]);
      }
      return;
    }
    facts.push({
      label: labelOf(name, fields),
      value: field ? choiceValue(field, value) : plainValue(value),
    });
  };
  for (const [key, value] of Object.entries(inputs ?? {})) {
    walk(value, [key]);
  }
  return facts;
}
