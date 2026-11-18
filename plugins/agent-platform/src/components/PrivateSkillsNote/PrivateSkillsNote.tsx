import { Alert } from '@backstage/ui';

import type { AgentPluginEntry, AgentSkillEntry } from '../../lib/agentManager';
import {
  privateSkillsNoteOf,
  privateSourcesOf,
  skillsCredentialOf,
} from '../../lib/privateSkills';
import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';

/**
 * Says how the agent will fetch the skills it takes from private repositories:
 * with the installation's credential, which agent-manager composes for every
 * agent with a git skill, or — when the installation has none, or its minted
 * token fails to refresh — a warning that the agent will not start, which lets
 * the person go on. Nothing while no picked source is private, or while
 * agent-manager's `get_info` is not read (the page reports a connection
 * problem on its own).
 */
export function PrivateSkillsNote({
  installation,
  skills,
  plugins,
  agentSecretName,
}: {
  installation: string;
  skills?: AgentSkillEntry[];
  plugins?: AgentPluginEntry[];
  /** An edited agent's own credential (`agentSkillsSecretOf`). */
  agentSecretName?: string;
}) {
  const { privateRepositories } = useSkillCatalog();
  const { info } = useAgentManagerInfo(installation);
  const privateSources = privateSourcesOf(
    { skills, plugins },
    privateRepositories,
  );
  if (!info || privateSources.length === 0) {
    return null;
  }
  const note = privateSkillsNoteOf({
    privateSources,
    credential: skillsCredentialOf(info, agentSecretName),
    installation,
  });
  return note ? (
    <Alert
      status={note.status}
      icon
      title={note.title}
      description={note.description}
    />
  ) : null;
}
