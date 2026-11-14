import {
  baseDataSet,
  inInstallation,
  type FixtureDataSet,
  type FixtureToolchain,
  type FixtureToolchainSource,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  imageTag,
  type AddSourceInput,
  type AddSourceResult,
  type BuildStatusResult,
  type CreateToolchainResult,
  type CreatedToolchain,
  type PackageSearch,
  type Toolchain,
  type ToolchainBuildState,
  type ToolchainDescribeResult,
  type ToolchainList,
  type ToolchainPackage,
  type ToolchainSource,
  type ToolchainSourceList,
  type WrittenToolchain,
} from '../../lib/toolchainManager';
import { SETTLE_MS } from './agentManagerFixtureState';
import { FIXTURE_HARNESS } from './agentPlatformFixtureData';
import { FIXTURE_USER } from './fixtureIdentity';

/**
 * toolchain-manager's state in fixture mode (docs/fixtures.md): the base
 * data set's toolchain sources and toolchains of each installation, the
 * sources a person adds and the pull requests they open. Writes change it in
 * memory only, so they last until the page reloads. A new toolchain's pull
 * request moves on one build state per {@link SETTLE_MS}, until it waits for
 * a person to merge it, which fixture mode never does.
 */

/** The registry the data set's sources publish to. */
const REGISTRY = 'registry.example.com/toolchains';

/** The package source `search_packages` searches, and its branches. */
const PACKAGE_SOURCE = 'packages.example.com';
const BRANCHES = ['stable', 'unstable'];

/** The packages of the package source: name, description, stable version. */
const PACKAGES: readonly [string, string, string][] = [
  ['go', 'The Go programming language', '1.23.4'],
  ['nodejs', 'A JavaScript runtime', '22.11.0'],
  ['python3', 'The Python interpreter', '3.12.7'],
  ['kubectl', 'The Kubernetes command line', '1.31.2'],
  ['kubernetes-helm', 'The Kubernetes package manager', '3.16.2'],
  ['jq', 'A command line JSON processor', '1.7.1'],
  ['yq-go', 'A command line YAML processor', '4.44.3'],
  ['gnumake', 'A build automation tool', '4.4.1'],
  ['ripgrep', 'A line-oriented search tool', '14.1.1'],
  ['shellcheck', 'A linter for shell scripts', '0.10.0'],
];

/** The package of the package source each command of the data set comes from. */
const PACKAGE_OF_COMMAND: Record<string, string> = {
  go: 'go',
  node: 'nodejs',
  python3: 'python3',
  kubectl: 'kubectl',
  helm: 'kubernetes-helm',
  jq: 'jq',
  yq: 'yq-go',
  make: 'gnumake',
};

/** The label a toolchain's Dockerfile names it with in its final stage. */
const NAME_LABEL = 'io.giantswarm.toolchain.name';

/** The build states a new toolchain's pull request goes through by itself. */
const BUILD_STEPS: readonly ToolchainBuildState[] = [
  'queued',
  'checking',
  'checked',
];

/** A toolchain's name: lower-case letters, digits and '-'. */
const TOOLCHAIN_NAME = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** A source's repository on GitHub: `<owner>/<name>`. */
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;

const urlOf = (repository: string) => `https://github.com/${repository}`;

/** A version with its `v`, as the sources tag them. */
const tagged = (version: string) =>
  version.startsWith('v') ? version : `v${version}`;

type StoredPull = CreatedToolchain & {
  dockerfile: string;
  openedAt: number;
};

/** What a person gave for a source they added, beyond the data set's record. */
type AddedSource = { registry: string; slackChannel?: string };

type InstallationState = {
  sources: FixtureToolchainSource[];
  added: Map<string, AddedSource>;
  toolchains: FixtureToolchain[];
  pulls: StoredPull[];
};

export class ToolchainManagerFixtureState {
  private readonly installations = new Map<string, InstallationState>();
  private nextPull = 101;

  constructor(
    private readonly data: FixtureDataSet = baseDataSet(),
    private readonly now: () => number = Date.now,
  ) {}

  private stateOf(installation: string): InstallationState {
    let state = this.installations.get(installation);
    if (!state) {
      state = {
        sources: inInstallation(this.data.toolchainSources, installation),
        toolchains: inInstallation(this.data.toolchains, installation),
        added: new Map(),
        pulls: [],
      };
      this.installations.set(installation, state);
    }
    return state;
  }

  private sourceOf(
    installation: string,
    name: string,
  ): FixtureToolchainSource | undefined {
    return this.stateOf(installation).sources.find(s => s.name === name);
  }

  /**
   * The offered sources, or the one `ref` names by name or repository, as
   * toolchain-manager resolves a source argument.
   */
  private offered(
    installation: string,
    ref: string | undefined,
  ): FixtureToolchainSource[] {
    const offered = this.stateOf(installation).sources.filter(
      s => s.state !== 'pending',
    );
    const wanted = ref?.trim().toLowerCase();
    if (!wanted) {
      return offered;
    }
    const source = offered.find(
      s =>
        s.name.toLowerCase() === wanted ||
        s.repository.toLowerCase() === wanted,
    );
    if (!source) {
      throw new Error(
        `no offered source ${ref}: list_sources shows the sources and whether their toolchains are offered`,
      );
    }
    return [source];
  }

  private toolchainOf(
    toolchain: FixtureToolchain,
    version?: string,
  ): Toolchain {
    const source = this.sourceOf(toolchain.installation, toolchain.source)!;
    const at = version ?? toolchain.versions[0];
    return {
      name: toolchain.name,
      source: source.name,
      repository: source.repository,
      version: at,
      image: `${REGISTRY}/${toolchain.name}:${imageTag(at)}`,
      ...(at === toolchain.versions[0] && {
        publishedAt: toolchain.publishedAt,
      }),
      releaseURL: `${urlOf(source.repository)}/releases/tag/${toolchain.name}/${at}`,
      versions: toolchain.versions,
    };
  }

  listToolchains(installation: string): ToolchainList {
    const state = this.stateOf(installation);
    const unreachable = state.sources.filter(s => s.state === 'unreachable');
    return {
      toolchains: state.toolchains.map(t => this.toolchainOf(t)),
      ...(unreachable.length > 0 && {
        unreachable: unreachable.map(s => ({
          source: s.name,
          repository: s.repository,
          reason: s.reason ?? '',
        })),
      }),
    };
  }

  describeToolchain(
    installation: string,
    input: { name: string; source?: string; version?: string },
  ): ToolchainDescribeResult {
    const name = input.name.trim();
    if (!name) {
      throw new Error('name the toolchain, as list_toolchains shows it');
    }
    const sources = new Set(
      this.offered(installation, input.source).map(s => s.name),
    );
    const published = this.stateOf(installation).toolchains.filter(
      t => t.name === name && sources.has(t.source),
    );
    // As toolchain-manager does: none is an error, and so is a name two
    // sources publish while the call names neither.
    if (published.length === 0) {
      const unreachable = this.stateOf(installation).sources.filter(
        s => s.state === 'unreachable' && sources.has(s.name),
      ).length;
      throw new Error(
        `no published toolchain ${name}: list_toolchains shows them${
          unreachable > 0 ? ` (${unreachable} sources unreachable)` : ''
        }`,
      );
    }
    if (published.length > 1) {
      throw new Error(
        `toolchain ${name} is published by the sources ${published
          .map(t => t.source)
          .join(' and ')}: name the source`,
      );
    }
    const [toolchain] = published;
    const version = input.version ? tagged(input.version) : undefined;
    if (version && !toolchain.versions.includes(version)) {
      throw new Error(
        `toolchain ${name} has no published version ${version}; it has ${toolchain.versions.join(', ')}`,
      );
    }
    const packages = toolchain.tools.map(tool => {
      const known = PACKAGES.find(([n]) => n === PACKAGE_OF_COMMAND[tool]);
      return [known?.[0] ?? tool, known?.[2] ?? '1.0.0'] as const;
    });
    return {
      toolchain: {
        ...this.toolchainOf(toolchain, version),
        harnesses: [FIXTURE_HARNESS],
        tools: toolchain.tools.map(tool => ({
          name: tool,
          version: `${tool} --version`,
        })),
        ...(toolchain.written
          ? { packages: Object.fromEntries(packages) }
          : {
              binaries: Object.fromEntries(
                toolchain.tools.map(tool => [tool, `/usr/local/bin/${tool}`]),
              ),
            }),
        egress: [`${PACKAGE_SOURCE}:443`],
        written: toolchain.written,
        dockerfile: toolchain.written
          ? dockerfileOf(
              toolchain.name,
              packages.map(([pkg]) => pkg),
            )
          : [
              'FROM registry.example.com/toolchains/base:1',
              ...toolchain.tools.map(
                tool =>
                  `COPY --from=registry.example.com/tools/${tool}:latest /bin/${tool} /usr/local/bin/${tool}`,
              ),
              `LABEL ${NAME_LABEL}="${toolchain.name}"`,
              '',
            ].join('\n'),
      },
    };
  }

  listSources(installation: string): ToolchainSourceList {
    const state = this.stateOf(installation);
    return {
      sources: state.sources.map(s => sourceOf(s, state.added.get(s.name))),
    };
  }

  addSource(installation: string, input: AddSourceInput): AddSourceResult {
    const repository = String(input.repository ?? '').trim();
    if (!REPOSITORY.test(repository)) {
      throw new Error(
        `add source: repository ${JSON.stringify(repository)} is not <owner>/<name>`,
      );
    }
    if (!input.registry) {
      throw new Error('add source: registry is required');
    }
    const state = this.stateOf(installation);
    if (state.sources.some(s => s.repository === repository)) {
      throw new Error(
        `add source: ${repository} is already a source of this installation`,
      );
    }
    const [owner, repo] = repository.toLowerCase().split('/');
    // Named after the repository, and its owner where another has the name.
    const name = state.sources.some(s => s.name === repo)
      ? `${owner}-${repo}`
      : repo;
    const source: FixtureToolchainSource = {
      installation,
      name,
      repository,
      state: 'pending',
      addedBy: FIXTURE_USER.email,
      addedAt: new Date(this.now()).toISOString(),
    };
    const added: AddedSource = {
      registry: input.registry,
      ...(input.slackChannel && { slackChannel: input.slackChannel }),
    };
    state.sources = [...state.sources, source];
    state.added.set(source.name, added);
    return { source: sourceOf(source, added) };
  }

  searchPackages(query: string): PackageSearch {
    const needle = query.trim().toLowerCase();
    return {
      source: PACKAGE_SOURCE,
      branches: BRANCHES,
      packages: PACKAGES.filter(([name]) => name.includes(needle)).map(
        ([name, description, version]): ToolchainPackage => ({
          name,
          description,
          url: `https://${PACKAGE_SOURCE}/${name}`,
          versions: { stable: version, unstable: nextMinor(version) },
        }),
      ),
    };
  }

  addPackages(input: { name: string; packages: string[] }): WrittenToolchain {
    const name = String(input.name ?? '');
    if (!TOOLCHAIN_NAME.test(name)) {
      throw new Error(
        `add packages: name ${JSON.stringify(name)}: lower-case letters, digits and "-"`,
      );
    }
    const packages = Array.isArray(input.packages) ? input.packages : [];
    if (packages.length === 0) {
      throw new Error('add packages: pick at least one package');
    }
    const unknown = packages.filter(p => !PACKAGES.some(([n]) => n === p));
    if (unknown.length > 0) {
      throw new Error(
        `add packages: ${PACKAGE_SOURCE} has no package ${unknown.join(', ')}`,
      );
    }
    return {
      toolchain: name,
      path: `toolchains/${name}/Dockerfile`,
      dockerfile: dockerfileOf(name, packages),
    };
  }

  createToolchain(
    installation: string,
    input: { dockerfile: string; name: string; source: string },
  ): CreateToolchainResult {
    const state = this.stateOf(installation);
    const name = input.name.trim();
    // The checks toolchain-manager makes, in its order and words.
    if (!TOOLCHAIN_NAME.test(name)) {
      throw new Error(
        `toolchain name ${JSON.stringify(name)}: want [a-z0-9-], the directory toolchains/<name>`,
      );
    }
    const declared = labelOf(input.dockerfile);
    if (declared !== name) {
      throw new Error(
        `the Dockerfile's final stage labels ${NAME_LABEL} ${JSON.stringify(declared)}, want ${JSON.stringify(name)}: the contract check holds it to the toolchain's directory`,
      );
    }
    const offered = this.offered(installation, input.source);
    if (offered.length !== 1) {
      throw new Error(
        offered.length === 0
          ? 'the installation offers no source: add_source adds one'
          : `name the source, one of ${offered.map(s => s.name).join(', ')}`,
      );
    }
    const [source] = offered;
    if (source.state === 'unreachable') {
      throw new Error(source.reason ?? `cannot reach ${source.repository}`);
    }
    if (
      state.toolchains.some(t => t.source === source.name && t.name === name)
    ) {
      throw new Error(
        `${source.repository} already has toolchain ${name} (toolchains/${name}/Dockerfile on main): describe_toolchain shows it`,
      );
    }
    const open = state.pulls.find(
      p => p.source === source.name && p.toolchain === name,
    );
    if (open) {
      throw new Error(
        `toolchain ${name} has an open pull request, ${open.pullURL}: toolchain_build_status follows it`,
      );
    }
    const pull = this.nextPull++;
    const stored: StoredPull = {
      toolchain: name,
      source: source.name,
      repository: source.repository,
      pull,
      pullURL: `${urlOf(source.repository)}/pull/${pull}`,
      branch: `toolchain/${name}`,
      dockerfile: input.dockerfile,
      openedAt: this.now(),
    };
    state.pulls.push(stored);
    return { created: createdOf(stored) };
  }

  buildStatus(
    installation: string,
    input: { name: string; source: string; pull?: number },
  ): BuildStatusResult {
    const state = this.stateOf(installation);
    const source = this.sourceOf(installation, input.source);
    const pull = state.pulls.find(
      p =>
        p.source === input.source &&
        p.toolchain === input.name &&
        (input.pull === undefined || p.pull === Number(input.pull)),
    );
    if (pull) {
      const step = Math.min(
        Math.floor((this.now() - pull.openedAt) / SETTLE_MS),
        BUILD_STEPS.length - 1,
      );
      const buildState = BUILD_STEPS[step];
      return {
        build: {
          toolchain: pull.toolchain,
          source: pull.source,
          repository: pull.repository,
          state: buildState,
          pull: pull.pull,
          pullURL: pull.pullURL,
          ...(buildState !== 'queued' && {
            jobs: [
              {
                name: 'toolchain-contract',
                state: buildState === 'checking' ? 'in_progress' : 'success',
                url: `${pull.pullURL}/checks`,
              },
            ],
          }),
        },
      };
    }
    const toolchain = state.toolchains.find(
      t => t.source === input.source && t.name === input.name,
    );
    if (!toolchain || !source) {
      throw new Error(
        `toolchain build status: no pull request adds ${input.name} to ${input.source}`,
      );
    }
    const published = this.toolchainOf(toolchain);
    return {
      build: {
        toolchain: toolchain.name,
        source: source.name,
        repository: source.repository,
        state: 'published',
        version: published.version,
        image: published.image,
        ...(published.releaseURL && { releaseURL: published.releaseURL }),
      },
    };
  }
}

function sourceOf(
  source: FixtureToolchainSource,
  added?: AddedSource,
): ToolchainSource {
  const configured = !source.addedBy;
  const approved = source.state !== 'pending';
  return {
    name: source.name,
    repository: source.repository,
    url: urlOf(source.repository),
    registry: added?.registry ?? REGISTRY,
    ...(added?.slackChannel && { slackChannel: added.slackChannel }),
    origin: configured ? 'configured' : 'added',
    phase: approved ? 'Approved' : 'Pending',
    offered: approved,
    ...(source.addedBy && {
      addedBy: source.addedBy,
      addedAt: source.addedAt,
    }),
    ...(approved &&
      !configured && {
        approvedBy: 'owner@example.com',
        approvedAt: source.addedAt,
      }),
  };
}

function createdOf({
  toolchain,
  source,
  repository,
  pull,
  pullURL,
  branch,
}: StoredPull): CreatedToolchain {
  return { toolchain, source, repository, pull, pullURL, branch };
}

/** The Dockerfile the manager writes from picked packages. */
function dockerfileOf(name: string, packages: string[]): string {
  return [
    `# The ${name} toolchain, written by the toolchain-manager.`,
    'FROM registry.example.com/toolchains/packages:1 AS build',
    `RUN install-packages ${packages.join(' ')}`,
    '',
    'FROM scratch',
    'COPY --from=build /toolchain /',
    `LABEL ${NAME_LABEL}="${name}"`,
    '',
  ].join('\n');
}

/** The name the Dockerfile's final stage labels, `''` without one. */
function labelOf(dockerfile: string): string {
  const stages = dockerfile.split(/^FROM\s/m);
  const last = stages[stages.length - 1] ?? '';
  const match = last.match(
    /^LABEL\s+io\.giantswarm\.toolchain\.name="?([^"\s]*)"?/m,
  );
  return match?.[1] ?? '';
}

/** `1.2.3` → `1.3.0`: the unstable branch is a minor ahead. */
function nextMinor(version: string): string {
  const [major, minor] = version.split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

let state: ToolchainManagerFixtureState | undefined;

/** The state every toolchain-manager fixture reads: built on first use. */
export function toolchainManagerFixtureState(): ToolchainManagerFixtureState {
  state ??= new ToolchainManagerFixtureState();
  return state;
}
