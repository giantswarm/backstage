import type {
  AgentManagerAgent,
  AgentManagerInfo,
  AgentPluginEntry,
  AgentSkillEntry,
} from './agentManager';
import { listOf } from './listOf';
import { canonicalRepoUrl, normalizedRepoUrl, repoSlug } from './skills';

/**
 * The private repositories among the git sources of an agent's skills and
 * plugins, as `owner/repo` slugs in first-seen order, each once. A repository
 * is private when the portal's skill discovery read it so
 * (`useSkillCatalog`'s `privateRepositories`, canonical URLs).
 */
export function privateSourcesOf(
  sources: { skills?: AgentSkillEntry[]; plugins?: AgentPluginEntry[] },
  privateRepositories: ReadonlySet<string>,
): string[] {
  const urls = [
    ...(sources.skills ?? []).map(entry =>
      'git' in entry ? entry.git.url : undefined,
    ),
    ...(sources.plugins ?? []).map(entry => entry.git?.url),
  ];
  const slugs = new Map<string, string>();
  for (const url of urls) {
    const key = url && canonicalRepoUrl(url);
    if (key && privateRepositories.has(key) && !slugs.has(key)) {
      slugs.set(key, repoSlug(normalizedRepoUrl(url)));
    }
  }
  return [...slugs.values()];
}

/**
 * An agent's own skills credential, from the chart values agent-manager
 * reports back (`skillsGitAuthSecretRef.name`); undefined when it has none.
 */
export function agentSkillsSecretOf(
  agent: Pick<AgentManagerAgent, 'values'> | undefined,
): string | undefined {
  const ref = agent?.values?.skillsGitAuthSecretRef;
  if (ref && typeof ref === 'object' && 'name' in ref) {
    const name = (ref as { name?: unknown }).name;
    return typeof name === 'string' && name ? name : undefined;
  }
  return undefined;
}

/**
 * How an agent on the installation fetches its private skills, as
 * agent-manager's `get_info` reports it: with the installation's credential
 * Secret (agent-manager composes it for every agent with a git skill that
 * names none of its own), whose minted token may have failed to refresh, or
 * with nothing — an anonymous fetch a private repository refuses.
 */
export type SkillsCredential =
  | { kind: 'none' }
  | { kind: 'agent'; secretName: string }
  | { kind: 'installation'; secretName: string; refreshError?: string };

/**
 * `agentSecretName` is an edited agent's own credential
 * (`skillsGitAuthSecretRef.name` in its values): an update keeps it.
 */
export function skillsCredentialOf(
  info: Pick<AgentManagerInfo, 'skillsGitAuthSecretName' | 'skillsGitAuthMint'>,
  agentSecretName?: string,
): SkillsCredential {
  const secretName = info.skillsGitAuthSecretName;
  if (agentSecretName && agentSecretName !== secretName) {
    return { kind: 'agent', secretName: agentSecretName };
  }
  if (!secretName) {
    return { kind: 'none' };
  }
  const refreshError = info.skillsGitAuthMint?.error || undefined;
  return { kind: 'installation', secretName, refreshError };
}

/** What the wizard says about the credential for the picked private skills. */
export type PrivateSkillsNote = {
  status: 'info' | 'warning';
  title: string;
  description: string;
};

export function privateSkillsNoteOf(options: {
  privateSources: string[];
  credential: SkillsCredential;
  installation: string;
}): PrivateSkillsNote | undefined {
  const { privateSources, credential, installation } = options;
  if (privateSources.length === 0) {
    return undefined;
  }
  const repositories = `${listOf(privateSources)} ${
    privateSources.length === 1 ? 'is a private repository' : 'are private'
  }`;
  if (credential.kind === 'none') {
    return {
      status: 'warning',
      title: 'No credential for private skills',
      description: `${repositories}, and agent-manager on ${installation} has no credential to fetch private skills with. The agent can be created, but it will not start until a platform admin sets agent-manager's skills credential: a Secret with the key token in the agent's namespace.`,
    };
  }
  if (credential.kind === 'agent') {
    return {
      status: 'info',
      title: 'Private skills',
      description: `${repositories}. The agent fetches them with its own credential Secret ${credential.secretName}, which saving keeps.`,
    };
  }
  if (credential.refreshError) {
    return {
      status: 'warning',
      title: 'The credential for private skills is failing',
      description: `${repositories}. The agent fetches them with the installation's credential Secret ${credential.secretName}, whose token agent-manager could not refresh: ${credential.refreshError}. Until a refresh succeeds, the agent may not start.`,
    };
  }
  return {
    status: 'info',
    title: 'Private skills',
    description: `${repositories}. The agent fetches them with the installation's credential Secret ${credential.secretName}; there is nothing to set up.`,
  };
}
