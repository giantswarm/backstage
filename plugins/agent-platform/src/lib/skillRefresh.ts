import type { AgentSkillEntry } from './agentManager';

/**
 * One skill of an agent, as the "Update skills" dry run reports it: what it is
 * pinned to now and what `refreshSkills` would pin it to — the head of its
 * repository's default branch. OCI skills are pinned by digest and never move
 * (`head` is undefined and `changes` false): they are listed so the person
 * sees the whole skill list, and left alone.
 */
export type SkillRefreshEntry = {
  name: string;
  kind: 'git' | 'oci';
  /** The git repository URL, or the OCI reference. */
  source: string;
  path?: string;
  /** The commit (git) or digest reference (OCI) the agent runs today. */
  pinned: string;
  /** The default-branch head the dry run resolved, for git skills. */
  head?: string;
  /** Whether confirming would move this skill. */
  changes: boolean;
};

function pinOf(skill: AgentSkillEntry): string {
  return 'git' in skill ? skill.git.commit : skill.oci;
}

/**
 * Where a skill lives: repository and path for git, the reference without its
 * digest for OCI. The refreshed list is matched on this rather than on `name`,
 * which agent-manager may have filled in from the path.
 */
function placeOf(skill: AgentSkillEntry): string {
  if ('git' in skill) {
    return `git:${skill.git.url}#${skill.path ?? ''}`;
  }
  const at = skill.oci.indexOf('@');
  return `oci:${at === -1 ? skill.oci : skill.oci.slice(0, at)}`;
}

/**
 * Pairs the agent's current skills with the skills agent-manager's dry run
 * (`validate_agent` with `update: true` and `refreshSkills`) would write, so
 * the dialog can show, per git skill, the pinned commit next to the head of
 * its repository's default branch and say which entries change.
 *
 * `refreshed` is the `skills` list of the dry run's values; `undefined` while
 * the dry run is still running or was refused, in which case every entry is
 * shown at its pin with no head.
 */
export function skillRefreshPlan(
  current: AgentSkillEntry[],
  refreshed: AgentSkillEntry[] | undefined,
): SkillRefreshEntry[] {
  const heads = new Map<string, string>();
  for (const skill of refreshed ?? []) {
    heads.set(placeOf(skill), pinOf(skill));
  }
  return current.map(skill => {
    const pinned = pinOf(skill);
    if (!('git' in skill)) {
      return {
        name: skill.name,
        kind: 'oci',
        source: skill.oci,
        pinned,
        changes: false,
      };
    }
    const head = heads.get(placeOf(skill));
    return {
      name: skill.name,
      kind: 'git',
      source: skill.git.url,
      ...(skill.path ? { path: skill.path } : {}),
      pinned,
      ...(head ? { head } : {}),
      changes: head !== undefined && head !== pinned,
    };
  });
}

/** Whether the dry run says anything would move. */
export function refreshChangesAnything(plan: SkillRefreshEntry[]): boolean {
  return plan.some(entry => entry.changes);
}
