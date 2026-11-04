import { useMemo } from 'react';
import {
  Agent,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useInstallationInventory } from '@giantswarm/backstage-plugin-gs';
import {
  type TagSourceProps,
  useReportTags,
} from '@giantswarm/backstage-plugin-ui-react';

import { QueryClientProvider } from '../QueryClientProvider';
import { useNamespacedFallback } from '../../hooks/useNamespacedResources';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { uniqueSkills } from '../../lib/customize';
import { skillTags } from '../../lib/skills';

/** The Agents list's read options, so this read shares its cached lists. */
const AGENT_LIST_OPTIONS = { enableDiscovery: false };

function AgentTags({ onTags }: TagSourceProps) {
  // Every installation with kagent, not the section's scope: one vocabulary
  // for the fleet.
  const installations = useInstallationInventory().installationsWith('kagent');
  const { resources, isLoading } = useNamespacedFallback(
    useResources(installations, Agent, {}, AGENT_LIST_OPTIONS),
    Agent,
    AGENT_LIST_OPTIONS,
  );
  const items = useMemo(
    () => resources.map(agent => agent.getTags()),
    [resources],
  );
  useReportTags(isLoading && items.length === 0 ? undefined : items, onTags);
  return null;
}

/**
 * The agents' tags across every installation with kagent, for a
 * `TagVocabularyProvider`. Read as the Agents list reads them, through this
 * plugin's query client, so a list already read is a cache hit.
 */
export function AgentTagSource(props: TagSourceProps) {
  return (
    <QueryClientProvider>
      <AgentTags {...props} />
    </QueryClientProvider>
  );
}

function SkillTags({ onTags }: TagSourceProps) {
  const { skills, isLoading } = useSkillCatalog();
  const items = useMemo(() => uniqueSkills(skills).map(skillTags), [skills]);
  useReportTags(isLoading ? undefined : items, onTags);
  return null;
}

/**
 * The skills' tags in every configured skill repository, one entry per
 * skill, for a `TagVocabularyProvider`. The skill catalogue's own read, so a
 * catalogue already read is a cache hit.
 */
export function SkillTagSource(props: TagSourceProps) {
  return (
    <QueryClientProvider>
      <SkillTags {...props} />
    </QueryClientProvider>
  );
}
