import {
  DeclarationEntry,
  DeclarationInput,
  Problem,
  Validation,
} from '../apis';

/**
 * The Create form: the declaration's fields as the manager's tools name
 * them. The choices offered for the enumerated fields mirror the
 * repositories schema of giantswarm/github and the engine's creation rules
 * (devctl's reposetup package) so a person picks instead of typing; the
 * manager's dry run stays the verdict on whatever the form sends.
 */
export interface DeclarationForm {
  /** The owning team's file, as its GitHub team slug: `team-bumblebee`. */
  team: string;
  name: string;
  componentType: string;
  /** `gen.language`. */
  language: string;
  /** `gen.flavours`. */
  flavours: string[];
  description: string;
  /** `public`, or empty for the org's default (private), left out of the entry. */
  visibility: string;
  /** `gen.ci.generate`: align-files generates and keeps the CircleCI config. */
  ciGenerate: boolean;
  /** Why, for the pull request body. */
  reason: string;
}

/** One value of an enumerated field, with what it means. */
export interface Choice {
  id: string;
  label: string;
  description?: string;
}

/** `componentType`, as the schema enumerates it, the common ones first. */
export const COMPONENT_TYPES: Choice[] = [
  {
    id: 'service',
    label: 'service',
    description: 'Runs somewhere: an operator, an API, a packaged app',
  },
  { id: 'library', label: 'library', description: 'Imported by other code' },
  { id: 'cli', label: 'cli', description: 'A command-line tool' },
  {
    id: 'configuration',
    label: 'configuration',
    description: 'GitOps and configuration files',
  },
  {
    id: 'customer',
    label: 'customer',
    description: 'A customer project repository',
  },
  {
    id: 'template',
    label: 'template',
    description: 'Repositories are created from it',
  },
  { id: 'appcatalog', label: 'appcatalog', description: 'An app catalog' },
  { id: 'unspecified', label: 'unspecified', description: 'Anything else' },
];

/** `gen.language`, as the schema enumerates it. */
export const LANGUAGES: Choice[] = [
  {
    id: 'generic',
    label: 'generic',
    description: 'No language build: a chart, configuration, documents',
  },
  { id: 'go', label: 'go', description: 'Built and tested with go-build' },
  { id: 'python', label: 'python' },
  { id: 'node', label: 'node', description: 'Built with the Node job' },
  { id: 'kyverno-policy', label: 'kyverno-policy' },
];

/** `gen.flavours`, as the schema enumerates them, the common ones first. */
export const FLAVOURS: Choice[] = [
  { id: 'app', label: 'app', description: 'a Helm chart under helm/<name>' },
  { id: 'generic', label: 'generic', description: 'no generated build files' },
  { id: 'cli', label: 'cli', description: 'released binaries' },
  { id: 'cluster-app', label: 'cluster-app', description: 'a cluster chart' },
  { id: 'fleet', label: 'fleet', description: 'a fleet configuration' },
  { id: 'customer', label: 'customer', description: 'a customer project' },
  { id: 'helmchart', label: 'helmchart', description: 'a plain Helm chart' },
  { id: 'k8sapi', label: 'k8sapi', description: 'a Kubernetes API' },
];

/** `visibility`: the org's default (private) is left out of the entry, as the team files do. */
export const VISIBILITIES: Choice[] = [
  {
    id: 'private',
    label: 'Private',
    description: 'The org’s default; not written into the entry',
  },
  {
    id: 'public',
    label: 'Public',
    description: 'On the internet: nothing internal goes in',
  },
];

/** The flavours whose repositories carry a Helm chart named after them. */
const CHART_FLAVOURS = ['app', 'cluster-app'];

/**
 * A kind of repository: the component type, language and flavours the
 * org's repositories of that shape declare. Picking one fills the fields;
 * every field stays editable.
 */
export interface Kind extends Choice {
  componentType: string;
  language: string;
  flavours: string[];
}

/** The kind whose fields match no preset: as set by hand. */
export const CUSTOM_KIND = 'custom';

/**
 * The kinds the org's team files declare, the most common shapes first:
 * a chart-only app (a packaged upstream component), a Go service with its
 * chart, a Go CLI, a Go library, a configuration repository, a customer
 * project, and anything else on the minimal scaffold.
 */
export const KINDS: Kind[] = [
  {
    id: 'go-service',
    label: 'Go service',
    description:
      'A Go service with its Helm chart: built, scanned and released by CircleCI.',
    componentType: 'service',
    language: 'go',
    flavours: ['app'],
  },
  {
    id: 'chart-app',
    label: 'Chart-only app',
    description:
      'A Helm chart for something built elsewhere: an upstream component packaged for the platform.',
    componentType: 'service',
    language: 'generic',
    flavours: ['app'],
  },
  {
    id: 'go-cli',
    label: 'Go CLI',
    description:
      'A Go command-line tool, cross-compiled and released as binaries.',
    componentType: 'cli',
    language: 'go',
    flavours: ['cli'],
  },
  {
    id: 'go-library',
    label: 'Go library',
    description:
      'A Go module other repositories import: built and tested, no image, no chart.',
    componentType: 'library',
    language: 'go',
    flavours: ['generic'],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    description:
      'GitOps or configuration files: nothing to build, no CircleCI.',
    componentType: 'configuration',
    language: 'generic',
    flavours: ['generic'],
  },
  {
    id: 'customer',
    label: 'Customer project',
    description:
      'A customer’s project repository: the generated workflows and Renovate, no CircleCI.',
    componentType: 'customer',
    language: 'generic',
    flavours: ['customer'],
  },
  {
    id: 'other',
    label: 'Other',
    description:
      'Docs, skills, experiments: the minimal scaffold, no CircleCI.',
    componentType: 'unspecified',
    language: 'generic',
    flavours: ['generic'],
  },
];

/** The form as it opens: a Go service, the org's default kind of new repository. */
export const EMPTY: DeclarationForm = {
  team: '',
  name: '',
  componentType: KINDS[0].componentType,
  language: KINDS[0].language,
  flavours: KINDS[0].flavours,
  description: '',
  visibility: '',
  ciGenerate: true,
  reason: '',
};

/**
 * Whether the CircleCI generator has a job for the declaration, the way the
 * engine judges it: a Go or Node build, or the app flavour's chart. (An
 * image needs `gen.ci.image.dockerfile`, which the form does not offer.)
 */
export function hasCIJob(language: string, flavours: string[]): boolean {
  return language === 'go' || language === 'node' || flavours.includes('app');
}

/** Whether the flavours produce a Helm chart, which is named after the repository. */
export function hasChart(flavours: string[]): boolean {
  return flavours.some(flavour => CHART_FLAVOURS.includes(flavour));
}

const REPOSITORY_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const CHART_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const CHART_SUFFIX = '-app';

/**
 * The engine's name rule the name breaks, in the engine's words, or nothing:
 * lowercase letters, digits, dots, dashes or underscores; with a chart, the
 * chart's stricter name without the `-app` suffix. An empty name breaks no
 * rule (it is missing, not wrong).
 */
export function nameProblem(
  name: string,
  flavours: string[],
): string | undefined {
  if (!name) {
    return undefined;
  }
  if (hasChart(flavours)) {
    if (!CHART_NAME.test(name)) {
      return 'must be lowercase letters, digits and dashes, starting and ending with a letter or digit (the chart is named after the repository)';
    }
    if (name.endsWith(CHART_SUFFIX)) {
      return `a chart repository is named after its chart, without the ${CHART_SUFFIX} suffix`;
    }
    return undefined;
  }
  return REPOSITORY_NAME.test(name)
    ? undefined
    : 'must be lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit';
}

/** Whether the form describes a declaration the manager can dry-run. */
export function isComplete(form: DeclarationForm): boolean {
  const name = form.name.trim();
  return (
    form.team.trim().length > 0 &&
    name.length > 0 &&
    !nameProblem(name, form.flavours)
  );
}

/** The kind the form's fields match, or [CUSTOM_KIND]. */
export function kindOf(form: DeclarationForm): string {
  const flavours = [...form.flavours].sort().join(',');
  return (
    KINDS.find(
      kind =>
        kind.componentType === form.componentType &&
        kind.language === form.language &&
        [...kind.flavours].sort().join(',') === flavours,
    )?.id ?? CUSTOM_KIND
  );
}

/**
 * The form with a kind's fields, the CircleCI generator on where the kind
 * has a job. [CUSTOM_KIND] changes nothing: the fields are as set.
 */
export function withKind(form: DeclarationForm, id: string): DeclarationForm {
  const kind = KINDS.find(candidate => candidate.id === id);
  if (!kind) {
    return form;
  }
  return withGen(form, {
    componentType: kind.componentType,
    language: kind.language,
    flavours: kind.flavours,
  });
}

/**
 * The form with changed generation fields; the CircleCI switch follows the
 * new language and flavours (on where a job exists), the person's own
 * toggle afterwards standing until the next such change.
 */
export function withGen(
  form: DeclarationForm,
  changes: Partial<
    Pick<DeclarationForm, 'componentType' | 'language' | 'flavours'>
  >,
): DeclarationForm {
  const next = { ...form, ...changes };
  return { ...next, ciGenerate: hasCIJob(next.language, next.flavours) };
}

/**
 * The entry field each form field writes, dotted the way the manager's
 * refusals name it (`gen.flavours[1]` names flavours).
 */
export const ENTRY_FIELDS = {
  name: 'name',
  componentType: 'componentType',
  language: 'gen.language',
  flavours: 'gen.flavours',
  description: 'description',
  visibility: 'visibility',
  ciGenerate: 'gen.ci.generate',
} as const satisfies Partial<Record<keyof DeclarationForm, string>>;

export type EntryField = keyof typeof ENTRY_FIELDS;

/**
 * The entry the form describes, as it goes into the team file: `name`,
 * `componentType`, `gen: {language, flavours, ci: {generate}}`,
 * `description`, `visibility`. Empty fields are left out so the schema's
 * defaults apply; every value is handed on as chosen -- the manager's dry
 * run says what it makes of it. `gen.ci.generate` is written out, true or
 * false, the way `devctl repo create` writes it: align-files reads the team
 * file, not the dry run, and an unset `generate` is not `true` to it.
 */
export function toEntry(form: DeclarationForm): DeclarationEntry {
  const gen: Record<string, unknown> = {};
  if (form.language.trim()) {
    gen.language = form.language.trim();
  }
  const flavours = form.flavours.map(flavour => flavour.trim()).filter(Boolean);
  if (flavours.length > 0) {
    gen.flavours = flavours;
  }
  gen.ci = { generate: form.ciGenerate };
  return {
    name: form.name.trim(),
    ...(form.componentType.trim() && {
      componentType: form.componentType.trim(),
    }),
    gen,
    ...(form.description.trim() && { description: form.description.trim() }),
    ...(form.visibility.trim() && { visibility: form.visibility.trim() }),
  };
}

/** The tools' arguments for the form: the same for the dry run and the commit. */
export function toInput(form: DeclarationForm): DeclarationInput {
  return {
    team: form.team.trim(),
    entry: toEntry(form),
    reason: form.reason.trim() || undefined,
  };
}

/** The form field a refusal names, if any (`gen.flavours[1]` → flavours). */
export function fieldOf(problem: Problem): EntryField | undefined {
  const path = problem.field.replace(/\[\d+\]$/, '');
  return (Object.keys(ENTRY_FIELDS) as EntryField[]).find(
    key => ENTRY_FIELDS[key] === path,
  );
}

/** Whether a refusal names this form field. */
export function refused(
  validation: Validation | undefined,
  field: EntryField,
): boolean {
  return !!validation?.entries.some(entry =>
    entry.problems?.some(problem => fieldOf(problem) === field),
  );
}

/** The value a refusal of a boolean field tells the person to set: `…; set it to false`. */
const SET_IT_TO = /\bset it to (true|false)\b/;

/**
 * The fix a refusal names, as a change to the form: the CircleCI switch's
 * refusal says which value to set, so it is one click. A refusal of a text
 * field marks the field; what to type is the person's.
 */
export function fixOf(problem: Problem): Partial<DeclarationForm> | undefined {
  if (fieldOf(problem) !== 'ciGenerate') {
    return undefined;
  }
  const match = SET_IT_TO.exec(problem.message);
  return match ? { ciGenerate: match[1] === 'true' } : undefined;
}
