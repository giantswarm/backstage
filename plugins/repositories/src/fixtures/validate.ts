import {
  Created,
  DeclarationEntry,
  DeclarationInput,
  ManagerSchema,
  Notice,
  Problem,
  Validation,
  ValidationEntry,
} from '../apis';
import { hasCIJob, nameProblem } from '../lib/declaration';

/** What the in-memory validator knows of the world. */
export interface ValidatorWorld {
  /** The vocabulary the manager reports in `get_info`: what an entry's values must be one of. */
  schema: Pick<ManagerSchema, 'componentTypes' | 'languages' | 'flavours'>;
  /** Whether `giantswarm/<name>` exists on GitHub. */
  taken: (name: string) => boolean;
  /** The caller's team slugs, as GitHub reports them. */
  callerTeams: string[];
  /** The caller's GitHub login. */
  login: string;
}

/** `gen` of an entry, as the form or a tool passes it. */
interface Gen {
  language?: string;
  flavours?: string[];
  ci?: { generate?: boolean };
}

/** The strings of a choice list, for a "must be one of" refusal. */
const oneOf = (ids: string[]) => ids.map(id => `"${id}"`).join(', ');

/**
 * The template the engine derives -- there is no template field: language
 * go → giantswarm/template, generic with the app flavour → template-app,
 * generic with the plans flavour → template-plans, the customer shape and
 * the rest → the minimal scaffold. Node has none yet.
 */
function deriveTemplate(
  componentType: string | undefined,
  gen: Gen,
): { template?: string; problem?: Problem } {
  if (componentType === 'customer' || gen.flavours?.includes('customer')) {
    return { template: 'minimal' };
  }
  switch (gen.language) {
    case 'go':
      return { template: 'giantswarm/template' };
    case 'node':
      return {
        problem: {
          field: 'gen.language',
          message: 'the Node template is not available yet',
        },
      };
    case 'generic':
      if (gen.flavours?.includes('app')) {
        return { template: 'giantswarm/template-app' };
      }
      if (gen.flavours?.includes('plans')) {
        return { template: 'giantswarm/template-plans' };
      }
      return { template: 'minimal' };
    default:
      return { template: 'minimal' };
  }
}

/** The entry as the team file would hold it, defaults applied (a one-item list). */
function render(entry: DeclarationEntry, gen: Gen): string {
  const lines = [`- name: ${entry.name}`];
  if (entry.componentType) {
    lines.push(`  componentType: ${entry.componentType}`);
  }
  if (entry.description) {
    lines.push(`  description: ${entry.description}`);
  }
  if (entry.visibility) {
    lines.push(`  visibility: ${entry.visibility}`);
  }
  lines.push('  gen:');
  if (gen.language) {
    lines.push(`    language: ${gen.language}`);
  }
  if (gen.flavours && gen.flavours.length > 0) {
    lines.push('    flavours:');
    gen.flavours.forEach(flavour => lines.push(`      - ${flavour}`));
  }
  lines.push('    ci:');
  lines.push(`      generate: ${gen.ci?.generate ?? true}`);
  return `${lines.join('\n')}\n`;
}

/**
 * One entry judged the way the engine's creation rules judge it: the
 * schema's enumerations, flavours and language required, the derived
 * template, generated CI needing a job, the name's rule and whether it is
 * free on GitHub.
 */
function judge(
  entry: DeclarationEntry,
  world: ValidatorWorld,
): ValidationEntry {
  const problems: Problem[] = [];
  const componentType = entry.componentType as string | undefined;
  const gen = (entry.gen ?? {}) as Gen;
  const flavours = gen.flavours ?? [];
  const language = gen.language ?? '';

  const { componentTypes = [], languages = [] } = world.schema;
  const reportedFlavours = world.schema.flavours ?? [];
  if (componentType && !componentTypes.includes(componentType)) {
    problems.push({
      field: 'componentType',
      message: `value must be one of ${oneOf(componentTypes)}`,
    });
  }
  if (flavours.length === 0) {
    problems.push({
      field: 'gen.flavours',
      message: 'required for a repository the reconciler creates',
    });
  }
  flavours.forEach((flavour, index) => {
    if (!reportedFlavours.includes(flavour)) {
      problems.push({
        field: `gen.flavours[${index}]`,
        message: `value must be one of ${oneOf(reportedFlavours)}`,
      });
    }
  });
  if (!language) {
    problems.push({
      field: 'gen.language',
      message: 'required for a repository the reconciler creates',
    });
  } else if (!languages.includes(language)) {
    problems.push({
      field: 'gen.language',
      message: `value must be one of ${oneOf(languages)}`,
    });
  }

  const derived =
    problems.length === 0 ? deriveTemplate(componentType, gen) : {};
  if (derived.problem) {
    problems.push(derived.problem);
  }
  if (
    derived.template &&
    gen.ci?.generate === true &&
    !hasCIJob(language, flavours)
  ) {
    problems.push({
      field: 'gen.ci.generate',
      message: `no CircleCI job for language ${language} without the app flavour or gen.ci.image.dockerfile; set it to false`,
    });
  }

  let nameCheck: ValidationEntry['nameCheck'] = {
    verdict: 'unchecked',
    detail: 'the name breaks the rule',
  };
  const rule = nameProblem(entry.name, flavours);
  if (rule) {
    problems.push({ field: 'name', message: rule });
  } else if (world.taken(entry.name)) {
    nameCheck = {
      verdict: 'taken',
      detail: `repository giantswarm/${entry.name} exists`,
    };
    problems.push({ field: 'name', message: `taken: ${nameCheck.detail}` });
  } else {
    nameCheck = {
      verdict: 'free',
      detail: `no repository giantswarm/${entry.name} on GitHub`,
    };
  }

  return {
    name: entry.name,
    rendered: render(entry, gen),
    ...(derived.template && { template: derived.template }),
    nameCheck,
    ...(problems.length > 0 && { problems }),
    accepted: problems.length === 0,
  };
}

/**
 * `validate_repository` over the fixtures: the engine's dry run as the
 * in-memory API answers it -- every entry judged, the team-review notice for
 * a team the caller is not in, the creation plan as the caller when every
 * entry is accepted.
 */
export function validateInMemory(
  input: DeclarationInput,
  world: ValidatorWorld,
): Validation {
  const entries = [
    ...(input.entry ? [input.entry] : []),
    ...(input.entries ?? []),
  ].map(entry => judge(entry, world));
  const accepted = entries.every(entry => entry.accepted);
  const notices: Notice[] = [];
  if (
    !world.callerTeams.includes(input.team) &&
    !world.callerTeams.includes('team-planeteers')
  ) {
    notices.push({
      kind: 'team-review',
      message: `${world.login} is not a member of ${input.team} or team-planeteers: the team's review will be required before the pull request merges`,
    });
  }
  const names = entries.map(entry => entry.name).join(', ');
  return {
    team: input.team,
    mode: 'create',
    schema: 'embedded',
    entries,
    ...(notices.length > 0 && { notices }),
    accepted,
    author: world.login,
    authorLogin: world.login,
    authorTeams: world.callerTeams,
    teamsSource: 'github',
    machineApproved: accepted && notices.length === 0,
    ...(accepted && {
      creation: {
        repositories: entries.map(entry => ({
          name: entry.name,
          steps: [
            {
              step: 'create',
              verdict: 'drift',
              changes: [
                `create giantswarm/${entry.name} (${
                  (input.entry?.visibility as string) ?? 'private'
                })`,
              ],
            },
            {
              step: 'scaffold',
              verdict: 'drift',
              changes: [
                'render the scaffold and push it as the first commit on main',
              ],
            },
          ],
        })),
        pullRequest: {
          repository: 'giantswarm/github',
          branch: `reposetup/create-${entries.map(e => e.name).join('-')}`,
          title: `feat(repositories): declare ${names} for ${input.team}`,
          files: [`repositories/${input.team}.yaml`],
          body: `## Problem\n\n${input.reason ?? '…'}`,
          as: world.login,
        },
      },
    }),
  };
}

/** `create_repository` in `mode: commit` over the fixtures, for an accepted dry run. */
export function createInMemory(validation: Validation, login: string): Created {
  if (!validation.accepted || !validation.creation?.pullRequest) {
    const refused = validation.entries
      .filter(entry => !entry.accepted)
      .map(
        entry =>
          `${entry.name}: ${(entry.problems ?? [])
            .map(problem => `${problem.field}: ${problem.message}`)
            .join('; ')}`,
      )
      .join('; ');
    throw new Error(
      `the engine refuses the declaration: ${refused} — fix it and run again (dryRun: true shows the rendered entries); nothing was created`,
    );
  }
  const { pullRequest } = validation.creation;
  return {
    repositories: validation.entries.map(entry => ({
      name: entry.name,
      repository: `https://github.com/giantswarm/${entry.name}`,
      created: true,
      scaffoldCommit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      steps: [
        { step: 'create', verdict: 'repaired', summary: 'created (private)' },
        {
          step: 'scaffold',
          verdict: 'repaired',
          summary: 'pushed as the first commit on main',
        },
      ],
    })),
    pullRequest: {
      number: 4242,
      url: 'https://github.com/giantswarm/github/pull/4242',
      branch: pullRequest.branch,
      title: pullRequest.title,
      author: login,
    },
    firstRelease: "v0.1.0 follows from the scaffold's auto-release",
  };
}
