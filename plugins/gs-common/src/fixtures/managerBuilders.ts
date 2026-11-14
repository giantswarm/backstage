import {
  DAY,
  MINUTE,
  each,
  hex,
  isoAgo,
  type BuilderContext,
  type BuilderSettings,
  type FixtureInstallation,
  type FixtureOrganization,
} from './builders';
import { createNamer, fixtureSentence } from './names';

/**
 * The builders of what the platform managers serve: workspace-manager's
 * providers, owners, repositories and workspaces, toolchain-manager's sources
 * and toolchains, and skill-manager's skill repositories.
 */

/**
 * A provider instance workspace-manager reads repositories from, and whether
 * the person granted its App in muster.
 */
export type FixtureProvider = {
  name: string;
  kind: string;
  host: string;
  connected: boolean;
};

/**
 * The provider instances of every installation: one the person granted and
 * one they have not, so a workspace on it needs their sign-in first.
 */
export const FIXTURE_PROVIDERS: readonly FixtureProvider[] = [
  {
    name: 'github',
    kind: 'github',
    host: 'github.example.com',
    connected: true,
  },
  {
    name: 'code-example',
    kind: 'gitlab',
    host: 'code.example.com',
    connected: false,
  },
];

/** An account on a provider instance whose repositories a workspace selects. */
export type FixtureRepositoryOwner = {
  provider: string;
  name: string;
  kind: 'organization' | 'group' | 'user';
};

/** A repository of an owner, as its provider lists it. */
export type FixtureRepository = {
  provider: string;
  owner: string;
  name: string;
  language?: string;
  topics: string[];
  archived: boolean;
  fork: boolean;
  /** Whether the person can read it; a workspace selecting one is refused. */
  readable: boolean;
  sizeKiB: number;
  /** RFC 3339. */
  pushedAt: string;
};

/**
 * A workspace's state: `synced` by its last sync, `syncing` while a sync
 * runs, `failed` when its last sync failed, `pending` before its first sync,
 * `deleting` once deleted, while Session directories remain on it.
 */
export const WORKSPACE_STATES = [
  'synced',
  'syncing',
  'failed',
  'pending',
  'deleting',
] as const;
export type WorkspaceState = (typeof WORKSPACE_STATES)[number];

/** One owner on one provider instance, and how the workspace selects from it. */
export type FixtureWorkspaceSource = {
  provider: string;
  owner: string;
  repositories?: string[];
  languages?: string[];
  topics?: string[];
};

export type FixtureWorkspace = {
  installation: string;
  /** The organization the workspace belongs to, by name. */
  organization: string;
  name: string;
  state: WorkspaceState;
  sources: FixtureWorkspaceSource[];
  /** RFC 3339. */
  createdAt: string;
  /** When the last sync ran; absent before the first. */
  lastSyncAt?: string;
};

/**
 * A toolchain source's state: `offered` once approved, `pending` until an
 * installation owner approves it, `unreachable` when it is offered but its
 * toolchains cannot be read as the person.
 */
export const TOOLCHAIN_SOURCE_STATES = [
  'offered',
  'offered',
  'pending',
  'unreachable',
] as const;
export type ToolchainSourceState = (typeof TOOLCHAIN_SOURCE_STATES)[number];

export type FixtureToolchainSource = {
  installation: string;
  name: string;
  /** `<owner>/<name>` on GitHub. */
  repository: string;
  state: ToolchainSourceState;
  /** Added by a person rather than configured. */
  addedBy?: string;
  /** RFC 3339. */
  addedAt: string;
};

export type FixtureToolchain = {
  installation: string;
  /** The source that publishes it, by name. */
  source: string;
  name: string;
  /** Every published version, `vX.Y.Z`, newest first. */
  versions: string[];
  /** RFC 3339, of the newest version. */
  publishedAt: string;
  /** The commands its image declares. */
  tools: string[];
  /** The manager wrote its Dockerfile from picked packages. */
  written: boolean;
};

/**
 * A skill repository's state, as skill-manager lists it: `readable`;
 * `private`, readable by the person; `readOnly`, no edit pull requests into
 * it; `failed`, which could not be read; `stale`, a failed read with the last
 * good listing kept; `hidden`, private and not readable by the person.
 */
export const SKILL_REPOSITORY_STATES = [
  'readable',
  'private',
  'readOnly',
  'failed',
  'stale',
  'hidden',
] as const;
export type SkillRepositoryState = (typeof SKILL_REPOSITORY_STATES)[number];

export type FixtureSkill = {
  name: string;
  description: string;
  /** The skill's directory in the repository. */
  path: string;
  tags: string[];
};

export type FixtureSkillPlugin = {
  name: string;
  path: string;
  format: 'agent-plugins' | 'claude-code';
  /** The skills it carries, by name. */
  skills: string[];
};

export type FixtureSkillRepository = {
  installation: string;
  url: string;
  ref: string;
  /** The commit the listing was read at. */
  commit: string;
  state: SkillRepositoryState;
  skills: FixtureSkill[];
  plugins: FixtureSkillPlugin[];
};

/** The languages of the fixture repositories, `undefined` for none. */
const LANGUAGES = ['Go', 'TypeScript', 'Python', 'Shell', undefined] as const;

/** The topics of the fixture repositories. */
const TOPICS = ['api', 'cli', 'operator', 'docs', 'helm', 'library'] as const;

/** The commands a toolchain's image declares. */
const COMMANDS = [
  'go',
  'node',
  'python3',
  'kubectl',
  'helm',
  'jq',
  'yq',
  'make',
] as const;

/** The tags of the fixture skills. */
const SKILL_TAGS = ['review', 'release', 'debugging', 'docs'] as const;

/** The owner every fixture repository URL on github.com names. */
const EXAMPLE_OWNER = 'example';

/** Owners, `count` on each provider instance; the first is a user. */
export function buildRepositoryOwners(
  context: BuilderContext,
  settings: BuilderSettings<FixtureRepositoryOwner['kind']> = {},
): FixtureRepositoryOwner[] {
  const name = createNamer(context.random);
  return each(
    FIXTURE_PROVIDERS,
    settings,
    { count: 2, states: ['organization', 'organization', 'user'] },
    (provider, kind, nameLength) => ({
      provider: provider.name,
      name: name(nameLength).name,
      kind:
        provider.kind === 'gitlab' && kind === 'organization' ? 'group' : kind,
    }),
  );
}

/**
 * Repositories, `count` of each owner. They take the languages and topics in
 * turn; every seventh is archived, every fifth a fork, and the fourth of each
 * owner is not readable by the person.
 */
export function buildRepositories(
  context: BuilderContext,
  owners: readonly FixtureRepositoryOwner[],
  settings: BuilderSettings<'repository'> = {},
): FixtureRepository[] {
  const name = createNamer(context.random);
  const perOwner = new Map<string, number>();
  return each(
    owners,
    settings,
    { count: 12, states: ['repository'] },
    (owner, _, nameLength) => {
      const key = `${owner.provider}/${owner.name}`;
      const i = perOwner.get(key) ?? 0;
      perOwner.set(key, i + 1);
      const language = LANGUAGES[i % LANGUAGES.length];
      return {
        provider: owner.provider,
        owner: owner.name,
        name: name(nameLength).name,
        ...(language && { language }),
        topics: [TOPICS[i % TOPICS.length], TOPICS[(i + 2) % TOPICS.length]],
        archived: i % 7 === 6,
        fork: i % 5 === 4,
        readable: i !== 3,
        sizeKiB: context.random.int(40, 250_000),
        pushedAt: isoAgo(context, context.random.int(MINUTE, 90 * DAY)),
      };
    },
  );
}

/**
 * How the workspaces of an installation select their repositories, in turn:
 * by language from the first owner; by name on the provider the person has
 * not granted (their sign-in needed first); by topic from the first owner and
 * one unreadable repository from the second (refused at a Session's start);
 * three repositories by name from the second owner.
 */
function sourcesOf(
  index: number,
  owners: readonly FixtureRepositoryOwner[],
  repositories: readonly FixtureRepository[],
): FixtureWorkspaceSource[] {
  const granted = owners.filter(
    owner =>
      FIXTURE_PROVIDERS.find(provider => provider.name === owner.provider)
        ?.connected,
  );
  const ungranted = owners.filter(owner => !granted.includes(owner));
  const reposOf = (owner: FixtureRepositoryOwner | undefined) =>
    repositories.filter(
      repository =>
        owner &&
        repository.provider === owner.provider &&
        repository.owner === owner.name,
    );
  const [first, second = first] = granted;
  const names = (owner: FixtureRepositoryOwner | undefined, picks: number[]) =>
    picks.flatMap(i => {
      const repository = reposOf(owner)[i];
      return repository ? [repository.name] : [];
    });
  const sourceOf = (
    owner: FixtureRepositoryOwner | undefined,
    selector: Omit<FixtureWorkspaceSource, 'provider' | 'owner'>,
  ): FixtureWorkspaceSource[] =>
    owner ? [{ provider: owner.provider, owner: owner.name, ...selector }] : [];
  switch (index % 4) {
    case 0:
      return sourceOf(first, { languages: [LANGUAGES[0]] });
    case 1:
      return ungranted.length > 0
        ? sourceOf(ungranted[0], {
            repositories: names(ungranted[0], [0, 1]),
          })
        : sourceOf(first, { topics: [TOPICS[0]] });
    case 2:
      return [
        ...sourceOf(first, { topics: [TOPICS[1]] }),
        ...sourceOf(second, { repositories: names(second, [3]) }),
      ];
    default:
      return sourceOf(second, { repositories: names(second, [0, 1, 2]) });
  }
}

/**
 * Workspaces, `count` in each ready organization the person is a member of:
 * workspace-manager lists the person's organizations' only.
 */
export function buildWorkspaces(
  context: BuilderContext,
  organizations: readonly FixtureOrganization[],
  owners: readonly FixtureRepositoryOwner[],
  repositories: readonly FixtureRepository[],
  settings: BuilderSettings<WorkspaceState> = {},
): FixtureWorkspace[] {
  const name = createNamer(context.random);
  const made = new Map<string, number>();
  return each(
    organizations.filter(
      organization =>
        organization.state === 'ready' && organization.role !== 'none',
    ),
    settings,
    { count: 2, states: WORKSPACE_STATES },
    (organization, state, nameLength) => {
      const index = made.get(organization.installation) ?? 0;
      made.set(organization.installation, index + 1);
      const created = context.random.int(2 * DAY, 60 * DAY);
      return {
        installation: organization.installation,
        organization: organization.name,
        name: name(nameLength).name,
        state,
        sources: sourcesOf(index, owners, repositories),
        createdAt: isoAgo(context, created),
        ...(state !== 'pending' && {
          lastSyncAt: isoAgo(context, context.random.int(MINUTE, 3 * DAY)),
        }),
      };
    },
  );
}

/** Toolchain sources, `count` in each installation. */
export function buildToolchainSources(
  context: BuilderContext,
  installations: readonly FixtureInstallation[],
  settings: BuilderSettings<ToolchainSourceState> = {},
): FixtureToolchainSource[] {
  const name = createNamer(context.random);
  return each(
    installations,
    settings,
    { count: 4, states: TOOLCHAIN_SOURCE_STATES },
    (installation, state, nameLength, index) => {
      const source = name(nameLength).name;
      return {
        installation: installation.name,
        name: source,
        repository: `${EXAMPLE_OWNER}/${source}`,
        state,
        // The configured sources come first; a person added the rest.
        ...(index % 4 >= 2 && { addedBy: 'someone@example.com' }),
        addedAt: isoAgo(context, context.random.int(DAY, 120 * DAY)),
      };
    },
  );
}

/**
 * Toolchains, `count` of each offered source whose toolchains can be read.
 * The second such source of an installation publishes one under a name the
 * first one publishes too, so the pages tell the two apart by their source.
 */
export function buildToolchains(
  context: BuilderContext,
  sources: readonly FixtureToolchainSource[],
  settings: BuilderSettings<'written' | 'handWritten'> = {},
): FixtureToolchain[] {
  const name = createNamer(context.random);
  const offered = sources.filter(source => source.state === 'offered');
  // Each source's toolchains so far, and each installation's first name.
  const made = new Map<FixtureToolchainSource, number>();
  const firstName = new Map<string, string>();
  return each(
    offered,
    settings,
    { count: 3, states: ['handWritten', 'written'] },
    (source, kind, nameLength) => {
      const ofSource = made.get(source) ?? 0;
      made.set(source, ofSource + 1);
      const sourceIndex = offered
        .filter(other => other.installation === source.installation)
        .indexOf(source);
      const shared = firstName.get(source.installation);
      const toolchain =
        sourceIndex === 1 && ofSource === 0 && shared
          ? shared
          : name(nameLength).name;
      if (!shared) {
        firstName.set(source.installation, toolchain);
      }
      const major = context.random.int(0, 2);
      const newest = context.random.int(1, 6);
      const versions = Array.from(
        { length: context.random.int(1, 5) },
        (_, i) => `v${major}.${Math.max(newest - i, 0)}.${i === 0 ? 1 : 0}`,
      ).filter((version, i, all) => all.indexOf(version) === i);
      const first = context.random.int(0, COMMANDS.length - 1);
      return {
        installation: source.installation,
        source: source.name,
        name: toolchain,
        versions,
        publishedAt: isoAgo(context, context.random.int(DAY, 45 * DAY)),
        tools: [COMMANDS[first], COMMANDS[(first + 3) % COMMANDS.length]],
        written: kind === 'written',
      };
    },
  );
}

/**
 * Skill repositories, `count` in each installation, each with `skills`
 * skills; one with plugins. A failed or hidden repository lists none.
 */
export function buildSkillRepositories(
  context: BuilderContext,
  installations: readonly FixtureInstallation[],
  settings: BuilderSettings<SkillRepositoryState> = {},
  skillSettings: { count?: number; nameLength?: number } = {},
): FixtureSkillRepository[] {
  const repositoryName = createNamer(context.random);
  const skillName = createNamer(context.random);
  return each(
    installations,
    settings,
    {
      count: SKILL_REPOSITORY_STATES.length,
      states: SKILL_REPOSITORY_STATES,
    },
    (installation, state, nameLength) => {
      const repository = repositoryName(nameLength).name;
      const listsSkills = state !== 'failed' && state !== 'hidden';
      const skills: FixtureSkill[] = listsSkills
        ? Array.from({ length: skillSettings.count ?? 4 }, (_, i) => {
            const skill = skillName(skillSettings.nameLength).name;
            return {
              name: skill,
              description: fixtureSentence(context.random),
              path: state === 'readOnly' ? `skills/${skill}` : skill,
              tags: [SKILL_TAGS[i % SKILL_TAGS.length]],
            };
          })
        : [];
      const plugins: FixtureSkillPlugin[] =
        state === 'readable' && skills.length >= 2
          ? [
              {
                name: `${repository}-essentials`,
                path: `plugins/${repository}-essentials`,
                format: 'agent-plugins',
                skills: skills.slice(0, 2).map(skill => skill.name),
              },
            ]
          : [];
      return {
        installation: installation.name,
        url:
          state === 'readOnly'
            ? `https://git.example.com/${EXAMPLE_OWNER}/${repository}`
            : `https://github.com/${EXAMPLE_OWNER}/${repository}`,
        ref: 'main',
        commit: hex(context, 40),
        state,
        skills,
        plugins,
      };
    },
  );
}
