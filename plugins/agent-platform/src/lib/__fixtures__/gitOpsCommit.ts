import type { CommitAgentResult } from '../agentManager';

/** A write in mode `commit` as agent-manager and model-manager answer it. */
export function committedTo(pullRequest?: string): CommitAgentResult {
  return {
    mode: 'commit',
    dryRun: false,
    commit: {
      repository: 'giantswarm/agents',
      base: 'main',
      directory: 'flux/agent-manager',
      kustomization: 'flux-giantswarm/agents',
      prune: true,
      branch: 'agent-manager/update-kagent-reviewer',
      files: [{ path: 'flux/agent-manager/reviewer.yaml', action: 'update' }],
      pullRequest,
      number: pullRequest ? Number(pullRequest.split('/').pop()) : undefined,
      author: 'jane',
    },
  };
}
