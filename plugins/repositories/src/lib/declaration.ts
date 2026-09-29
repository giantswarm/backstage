import {
  DeclarationEntry,
  DeclarationInput,
  InventoryRecord,
  LifecycleChange,
  ManagerInfo,
  Problem,
  Validation,
} from '../apis';

/**
 * The declaration as a form -- Create repository's, and Edit's for an
 * existing entry: the declaration's fields as the manager's tools name them.
 * The enumerated fields offer the values the manager reports in `get_info`'s
 * `schema` (`vocabularyOf`), so a person picks instead of typing; the
 * presets and the name and flavour rules mirror the engine's creation rules
 * (devctl's reposetup package and its generators). The manager's dry run
 * stays the verdict on whatever the form sends.
 */
export interface DeclarationForm {
  /** The owning team's file, as its GitHub team slug: `team-bumblebee`. */
  team: string;
  name: string;
  componentType: string;
  /** `gen.language`. */
  language: string;
  /** `gen.flavours`: the nature first, then its add-ons. */
  flavours: string[];
  description: string;
  /** `public`, or empty for the org's default (private), left out of the entry. */
  visibility: string;
  /** `gen.ci.generate`: align-files generates and keeps the CircleCI config. */
  ciGenerate: boolean;
  /**
   * `align`: the repository's opt-in to alignment -- the reconciler changes
   * it to its declared set-up; without it the runs only check. On the form
   * of an existing entry; a new repository is opted in by its creation, so
   * the Create form does not carry it.
   */
  align?: boolean;
  /** Why, for the pull request body. */
  reason: string;
}

/** One value of an enumerated field, with what it means. */
export interface Choice {
  id: string;
  label: string;
  description?: string;
}

/** How the form shows a value the manager reports: its label and meaning. */
type Presentation = Omit<Choice, 'id'>;

/** An add-on flavour: generated on top of the nature, some only with one. */
export interface Addon extends Choice {
  /** The nature the add-on needs, if any. */
  needs?: string;
}

/**
 * `componentType`, keyed by the value the manager reports, the common ones
 * first.
 */
const COMPONENT_TYPE_TEXT: Record<string, Presentation> = {
  service: {
    label: 'service',
    description: 'Runs somewhere: an operator, an API, a packaged app',
  },
  library: { label: 'library', description: 'Imported by other code' },
  cli: { label: 'cli', description: 'A command-line tool' },
  configuration: {
    label: 'configuration',
    description: 'GitOps and configuration files',
  },
  customer: { label: 'customer', description: 'A customer project repository' },
  template: {
    label: 'template',
    description: 'Repositories are created from it',
  },
  appcatalog: { label: 'appcatalog', description: 'An app catalog' },
  unspecified: { label: 'unspecified', description: 'Anything else' },
};

/** `gen.language`, keyed by the value the manager reports. */
const LANGUAGE_TEXT: Record<string, Presentation> = {
  generic: {
    label: 'generic',
    description: 'No language build: a chart, configuration, documents',
  },
  go: { label: 'go', description: 'Built and tested with go-build' },
  python: { label: 'python' },
  node: { label: 'node', description: 'Built with the Node job' },
  'kyverno-policy': { label: 'kyverno-policy' },
};

/** The language devctl builds a CLI for: `gen makefile` refuses the cli flavour with any other. */
const CLI_LANGUAGE = 'go';

/**
 * `gen.flavours`, the nature of the repository: what devctl generates for
 * it. The org's repositories declare one of these each; the add-ons come on
 * top. A reported flavour that is neither a nature here nor an add-on below
 * is offered as an add-on under its own id.
 */
const NATURE_TEXT: Record<string, Presentation> = {
  app: {
    label: 'app',
    description:
      'A Helm chart under helm/<name>: the chart pipeline and the values-schema check. The repository is named after its chart.',
  },
  generic: {
    label: 'generic',
    description:
      'Nothing specific: the shared Makefile, workflows and Renovate config only.',
  },
  cli: {
    label: 'cli',
    description:
      'A command-line tool: its binaries are built and put on the GitHub release. Go only.',
  },
  customer: {
    label: 'customer',
    description:
      'A customer project: the customer board automation and Renovate, no CircleCI, the minimal scaffold.',
  },
  fleet: {
    label: 'fleet',
    description:
      'A GitOps repository with clusters: the cluster values validation.',
  },
};

/** `gen.flavours`, the add-ons, keyed by the value the manager reports. */
const ADDON_TEXT: Record<string, Omit<Addon, 'id'>> = {
  'cluster-app': {
    label: 'cluster-app',
    description:
      'A cluster chart with the RFC 55 values schema: the schema and docs validation and the render-diff workflows.',
    needs: 'app',
  },
  k8sapi: {
    label: 'k8sapi',
    description:
      'Provides a Kubernetes API: the Makefile targets for its custom resource definitions.',
  },
  plans: {
    label: 'plans',
    description:
      'A team plans repository: PRDs, their companion websites and the plan-workflow agent skills, from giantswarm/template-plans.',
    needs: 'generic',
  },
};

/**
 * The reported flavours the form does not offer, on purpose:
 * - `fork` declares a fork line, an upstream's history with carried patches
 *   on the branch the entry declares as `defaultBranch`; nothing is
 *   generated for it. A repository the reconciler creates empty is not one,
 *   and the form carries no `defaultBranch`.
 * - `helmchart` is a pre-commit flavour (`gen.preCommit`) that devctl's
 *   generators refuse in `gen.flavours`: a repository declaring it could not
 *   be aligned.
 * An existing entry that declares one keeps it (`withNature`, `withAddons`).
 */
const UNOFFERED_FLAVOURS = ['fork', 'helmchart'];

/** `visibility`, keyed by the value the manager reports. */
const VISIBILITY_TEXT: Record<string, Presentation> = {
  private: {
    label: 'Private',
    description: 'The org’s default; not written into the entry',
  },
  public: {
    label: 'Public',
    description: 'On the internet: nothing internal goes in',
  },
};

/** The org's default visibility: the form's empty value, left out of the entry. */
export const DEFAULT_VISIBILITY = 'private';

/** What the form says of a reported value it has no presentation for. */
const UNDESCRIBED =
  'Reported by giantswarm-repo-manager; the Dev Portal has no description of it yet.';

/**
 * The declaration's vocabulary: the values the manager reports in
 * `get_info`'s `schema`, with the form's presentation of them. The form
 * offers these and no others.
 */
export interface Vocabulary {
  componentTypes: Choice[];
  languages: Choice[];
  natures: Choice[];
  addons: Addon[];
  visibilities: Choice[];
}

/**
 * The reported values as choices: the ones with a presentation in its
 * order, then the others as reported, under their own id.
 */
function choicesOf<T extends Presentation>(
  values: string[],
  text: Record<string, T>,
): (T & { id: string })[] {
  const known = Object.keys(text).filter(id => values.includes(id));
  const unknown = values.filter(id => !(id in text));
  return [
    ...known.map(id => ({ ...text[id], id })),
    ...unknown.map(
      id => ({ label: id, description: UNDESCRIBED, id }) as T & { id: string },
    ),
  ];
}

/** The schema lists the form needs, by the name `get_info` gives them. */
const REQUIRED_LISTS = [
  'componentTypes',
  'languages',
  'flavours',
  'visibilities',
] as const;

/**
 * The vocabulary the manager reports, or why there is none: an older
 * manager reports no schema, and one that could not read it says why.
 * There is no fallback -- without the report the form offers nothing.
 */
export function vocabularyOf(
  info: Pick<ManagerInfo, 'version' | 'schema'>,
): { vocabulary: Vocabulary } | { problem: string } {
  const schema = info.schema;
  if (!schema) {
    return {
      problem: `giantswarm-repo-manager ${info.version} does not report the repositories schema; the form needs a version that does.`,
    };
  }
  if (schema.error) {
    return {
      problem: `giantswarm-repo-manager could not read the repositories schema (${schema.origin}): ${schema.error}`,
    };
  }
  const missing = REQUIRED_LISTS.filter(list => !schema[list]?.length);
  if (missing.length > 0) {
    return {
      problem: `giantswarm-repo-manager reports no ${missing.join(', ')} in the repositories schema (${schema.origin}).`,
    };
  }
  const flavours = (schema.flavours as string[]).filter(
    id => !UNOFFERED_FLAVOURS.includes(id),
  );
  return {
    vocabulary: {
      componentTypes: choicesOf(
        schema.componentTypes as string[],
        COMPONENT_TYPE_TEXT,
      ),
      languages: choicesOf(schema.languages as string[], LANGUAGE_TEXT),
      natures: choicesOf(
        flavours.filter(id => id in NATURE_TEXT),
        NATURE_TEXT,
      ),
      addons: choicesOf(
        flavours.filter(id => !(id in NATURE_TEXT)),
        ADDON_TEXT,
      ),
      visibilities: choicesOf(schema.visibilities as string[], VISIBILITY_TEXT),
    },
  };
}

/** The flavours whose repositories carry a Helm chart named after them. */
const CHART_FLAVOURS = ['app', 'cluster-app'];

/**
 * A preset: the component type, language and flavours the org's
 * repositories of that shape declare. Picking one fills the declaration;
 * every field stays editable.
 */
export interface Preset extends Choice {
  componentType: string;
  language: string;
  flavours: string[];
}

/**
 * The shapes the org's team files declare, the most common first: a Go
 * service with its chart, a chart-only app (a packaged upstream component),
 * a Go CLI, a Go library, a configuration repository, a customer project, a
 * team plans repository, and anything else on the minimal scaffold.
 */
export const PRESETS: Preset[] = [
  {
    id: 'go-service',
    label: 'Go service',
    description:
      'Go with its Helm chart; built, scanned and released by CircleCI.',
    componentType: 'service',
    language: 'go',
    flavours: ['app'],
  },
  {
    id: 'chart-app',
    label: 'Chart-only app',
    description: 'A Helm chart for something built elsewhere.',
    componentType: 'service',
    language: 'generic',
    flavours: ['app'],
  },
  {
    id: 'go-cli',
    label: 'Go CLI',
    description: 'A Go command-line tool, released as binaries.',
    componentType: 'cli',
    language: 'go',
    flavours: ['cli'],
  },
  {
    id: 'go-library',
    label: 'Go library',
    description: 'A Go module others import; no image, no chart.',
    componentType: 'library',
    language: 'go',
    flavours: ['generic'],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    description: 'GitOps or configuration files; nothing to build.',
    componentType: 'configuration',
    language: 'generic',
    flavours: ['generic'],
  },
  {
    id: 'customer',
    label: 'Customer project',
    description: 'Issues and boards shared with a customer; no CircleCI.',
    componentType: 'customer',
    language: 'generic',
    flavours: ['customer'],
  },
  {
    id: 'plans',
    label: 'Team plans',
    description:
      'PRDs, their companion websites and the plan-workflow agent skills; no CircleCI.',
    componentType: 'unspecified',
    language: 'generic',
    flavours: ['generic', 'plans'],
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Docs, skills, experiments: the minimal scaffold.',
    componentType: 'unspecified',
    language: 'generic',
    flavours: ['generic'],
  },
];

/** The form as it opens: a Go service, the org's default kind of new repository. */
export const EMPTY: DeclarationForm = {
  team: '',
  name: '',
  componentType: PRESETS[0].componentType,
  language: PRESETS[0].language,
  flavours: PRESETS[0].flavours,
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

/**
 * The generator's rule the flavours break with the language, in devctl's
 * words, or nothing: `gen makefile` builds a CLI for Go only.
 */
export function flavourProblem(
  language: string,
  flavours: string[],
): string | undefined {
  return flavours.includes('cli') && language !== CLI_LANGUAGE
    ? `flavour cli is supported only for language ${CLI_LANGUAGE}: pick ${CLI_LANGUAGE}, or another nature`
    : undefined;
}

/** Whether the form describes a declaration the manager can dry-run. */
export function isComplete(form: DeclarationForm): boolean {
  const name = form.name.trim();
  return (
    form.team.trim().length > 0 &&
    name.length > 0 &&
    !nameProblem(name, form.flavours) &&
    !flavourProblem(form.language, form.flavours)
  );
}

/** The nature among the flavours, if the vocabulary offers it. */
export function natureOf(
  flavours: string[],
  vocabulary: Vocabulary,
): string | undefined {
  return flavours.find(flavour =>
    vocabulary.natures.some(nature => nature.id === flavour),
  );
}

/** The add-ons among the flavours that the vocabulary offers. */
export function addonsOf(flavours: string[], vocabulary: Vocabulary): string[] {
  return flavours.filter(flavour =>
    vocabulary.addons.some(addon => addon.id === flavour),
  );
}

/** Whether an add-on goes with the nature: the one it needs, or any. */
export function addonAllowed(
  addon: Addon,
  nature: string | undefined,
): boolean {
  return !addon.needs || addon.needs === nature;
}

/** The flavours the form does not offer on purpose, kept as the entry declares them. */
function unofferedOf(flavours: string[]): string[] {
  return flavours.filter(flavour => UNOFFERED_FLAVOURS.includes(flavour));
}

/** The form with the nature, keeping the add-ons that go with it. */
export function withNature(
  form: DeclarationForm,
  nature: string,
  vocabulary: Vocabulary,
): DeclarationForm {
  const addons = vocabulary.addons
    .filter(addon => form.flavours.includes(addon.id))
    .filter(addon => addonAllowed(addon, nature))
    .map(addon => addon.id);
  return withGen(form, {
    flavours: [nature, ...addons, ...unofferedOf(form.flavours)],
  });
}

/** The form with these add-ons, the nature staying first. */
export function withAddons(
  form: DeclarationForm,
  addons: string[],
  vocabulary: Vocabulary,
): DeclarationForm {
  const nature = natureOf(form.flavours, vocabulary);
  return withGen(form, {
    flavours: [
      ...(nature ? [nature] : []),
      ...addons,
      ...unofferedOf(form.flavours),
    ],
  });
}

/**
 * The presets the vocabulary can declare: one whose catalog type, language
 * or flavours the manager does not report would be refused, so it is not
 * offered.
 */
export function presetsOf(vocabulary: Vocabulary): Preset[] {
  const offers = (choices: Choice[], id: string) =>
    choices.some(choice => choice.id === id);
  const flavours = [...vocabulary.natures, ...vocabulary.addons];
  return PRESETS.filter(
    preset =>
      offers(vocabulary.componentTypes, preset.componentType) &&
      offers(vocabulary.languages, preset.language) &&
      preset.flavours.every(flavour => offers(flavours, flavour)),
  );
}

/** The preset the form's fields match, or nothing: adjusted by hand. */
export function presetOf(form: DeclarationForm): string | undefined {
  const flavours = [...form.flavours].sort().join(',');
  return PRESETS.find(
    preset =>
      preset.componentType === form.componentType &&
      preset.language === form.language &&
      [...preset.flavours].sort().join(',') === flavours,
  )?.id;
}

/**
 * The form with a preset's fields, the CircleCI generator on where the
 * preset has a job. An unknown id changes nothing.
 */
export function withPreset(form: DeclarationForm, id: string): DeclarationForm {
  const preset = PRESETS.find(candidate => candidate.id === id);
  if (!preset) {
    return form;
  }
  return withGen(form, {
    componentType: preset.componentType,
    language: preset.language,
    flavours: preset.flavours,
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
  align: 'align',
} as const satisfies Partial<Record<keyof DeclarationForm, string>>;

export type EntryField = keyof typeof ENTRY_FIELDS;

/** The form fields the Declaration section's raw controls set. */
export const DECLARATION_FIELDS: EntryField[] = [
  'componentType',
  'language',
  'flavours',
  'ciGenerate',
];

/**
 * The entry the form describes, as it goes into the team file: `name`,
 * `componentType`, `gen: {language, flavours, ci: {generate}}`,
 * `description`, `visibility`. Empty fields are left out so the schema's
 * defaults apply; every value is handed on as chosen -- the manager's dry
 * run says what it makes of it. `gen.ci.generate` is written out, true or
 * false, the way `devctl repo create` writes it: align-files reads the team
 * file, not the dry run, and an unset `generate` is not `true` to it.
 * `align` is written when the form is opted in; `editedEntry` decides for
 * an existing entry's explicit `false`.
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
    ...(form.align && { align: true }),
  };
}

/**
 * GitHub's primary language as `gen.language`, for the ones devctl builds;
 * anything else is generic.
 */
const GITHUB_LANGUAGES: Record<string, string> = {
  Go: 'go',
  Python: 'python',
  TypeScript: 'node',
  JavaScript: 'node',
};

/** The lifecycles an adoption may end a repository's life with. */
export type AdoptedLifecycle = Exclude<LifecycleChange, 'deleted'>;

/**
 * The form for adopting a repository that exists and no team file declares:
 * what GitHub knows of it as the declaration's start -- the description, the
 * visibility (private, the org's default, left out), the language it is
 * written in -- with the generic nature and the CircleCI generator off, since
 * an adopted repository keeps the build it has; not opted in to alignment
 * until the person says so. The team is the person's choice.
 */
export function fromReality(record: InventoryRecord): DeclarationForm {
  const reality = record.reality;
  return {
    ...withGen(EMPTY, {
      componentType: 'unspecified',
      language: GITHUB_LANGUAGES[reality?.language ?? ''] ?? 'generic',
      flavours: ['generic'],
    }),
    name: record.name,
    description: reality?.description ?? '',
    visibility: reality?.visibility.toLowerCase() === 'public' ? 'public' : '',
    ciGenerate: false,
    align: false,
  };
}

/**
 * The entry an adoption sends: the form's declaration and, when the
 * adoption ends the repository's life, the lifecycle -- the manager adds the
 * opt-in a lifecycle needs.
 */
export function adoptEntry(
  form: DeclarationForm,
  lifecycle?: AdoptedLifecycle,
): DeclarationEntry {
  return { ...toEntry(form), ...(lifecycle && { lifecycle }) };
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
