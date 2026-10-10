import { useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import {
  EmptyStateCard,
  LoadingIndicator,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  useAgentManagerAvailability,
  useAgentManagerInfo,
} from '../../hooks/useAgentManager';
import { useAgentManagerAgent } from '../../hooks/useAgentManagerAgent';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { formStateOfAgent } from '../../lib/agentEdit';
import type { AgentManagerAgent, WriteMode } from '../../lib/agentManager';
import type { DiscoveredSkill } from '../../lib/skills';
import { agentDetailRouteRef, agentEditRouteRef } from '../../routes';
import {
  agentManagerAbsenceReason,
  agentWriteMode,
} from '../AgentDetailPage/AgentActionsMenu';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { NewAgentFormProvider } from '../NewAgentFormProvider';
import { NewAgentPage } from '../NewAgentPage';
import { NewAgentReviewPage } from '../NewAgentReviewPage';
import { NewAgentSkillsPage } from '../NewAgentSkillsPage';
import { NewAgentToolsPage } from '../NewAgentToolsPage';

/**
 * The wizard, seeded once from agent-manager's reading of the agent — one read
 * after the page mounted, never a cached one (`freshOnMount`) — into its own
 * form state (the create flow's draft, held by the router's provider, stays
 * untouched) and the agent as the baseline the review compares against. A
 * later re-read of the agent does not reseed what the person is changing.
 */
function EditAgentWizard({
  installation,
  agent,
  writeMode,
  detailHref,
  catalog,
  platformHarness,
}: {
  installation: string;
  agent: AgentManagerAgent;
  writeMode: WriteMode;
  detailHref: string | undefined;
  catalog: DiscoveredSkill[];
  platformHarness: string | undefined;
}) {
  const [seed] = useState(() => ({
    edit: { agent, installation, writeMode, detailHref },
    state: formStateOfAgent(agent, { installation, catalog, platformHarness }),
  }));
  return (
    <NewAgentFormProvider edit={seed.edit} initialState={seed.state}>
      <Routes>
        <Route index element={<NewAgentPage />} />
        <Route path="skills" element={<NewAgentSkillsPage />} />
        <Route path="tools" element={<NewAgentToolsPage />} />
        <Route path="review" element={<NewAgentReviewPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </NewAgentFormProvider>
  );
}

/**
 * Edit an agent (`/agent-platform/agents/edit/<installation>/<namespace>/<name>`
 * and its `/skills`, `/tools`, `/review` steps): the create wizard, prefilled.
 * Like `EditSkillPage` for skills, this page only reads what the wizard needs
 * — agent-manager's `get_agent` (its availability and, for an agent applied
 * from git, the commit capability, decide whether there is a form at all) and
 * the skill catalog the skills step matches the agent's pins against — and
 * then hands over to the wizard's own steps in edit mode: same plain-first
 * fields, model and runtime under More options showing the agent's own, and a
 * review that saves only what changed (`update_agent`, or a pull request for
 * an agent applied from git).
 */
export function EditAgentPage() {
  const { installation = '', namespace = '', name = '' } = useParams();
  const agentDetailLink = useRouteRef(agentDetailRouteRef);
  const detailHref = agentDetailLink?.({ installation, namespace, name });

  // Feature detection, the same as the create flow's and the detail page's:
  // edits go through agent-manager, reached through the installation's muster.
  const availability = useAgentManagerAvailability(
    installation ? [installation] : [],
  );
  const presence = availability.presenceOf(installation);
  const { agent, isLoading, failure } = useAgentManagerAgent(
    installation,
    namespace,
    name,
    // Never seeded from a cached reading: straight after a save it may still
    // be the pre-save agent, and the next save would diff against it.
    { enabled: presence === 'available', freshOnMount: true },
  );
  const { info, isLoading: isInfoLoading } = useAgentManagerInfo(
    presence === 'available' ? installation : undefined,
  );
  const catalog = useSkillCatalog();

  // An agent applied from git is edited through a pull request when
  // agent-manager reports the commit capability, and never offered otherwise —
  // the same sentence the detail page's actions menu gives.
  const isGitOpsOwned = agent?.managed === 'gitops';
  const canCommit = info?.capabilities?.commit === true;
  const gate = {
    presence,
    isUnavailable: availability.isUnavailable,
    isGitOpsOwned,
    canCommit,
    isVerdictPending: isLoading || (isGitOpsOwned && isInfoLoading),
  };
  const writeMode = agentWriteMode(gate);
  const reason = agentManagerAbsenceReason(
    { ...gate, isGitOpsOwned: isGitOpsOwned && !canCommit },
    installation,
  );
  // The skills step selects the agent's pins on the catalog's cards, so the
  // wizard waits for the catalog (a failed one leaves every pin as it is).
  const isCatalogPending = catalog.isLoading && catalog.skills.length === 0;

  const backLink = detailHref ? (
    <Link to={detailHref}>Back to the agent</Link>
  ) : undefined;

  let body;
  if (reason) {
    body = (
      <EmptyStateCard
        title="This agent cannot be edited from here"
        description={reason}
        actions={backLink}
      />
    );
  } else if (
    presence === 'unknown' ||
    gate.isVerdictPending ||
    (agent && isCatalogPending)
  ) {
    body = <LoadingIndicator label="Reading the agent…" />;
  } else if (failure) {
    body = (
      <Flex direction="column" gap="3">
        {failure.kind === 'not-connected' ? (
          <ConnectAgentManagerAlert
            installation={installation}
            message={failure.message}
            action="Agents are edited"
          />
        ) : (
          <Alert
            status="danger"
            title="agent-manager could not read this agent"
            description={failure.message}
          />
        )}
        {backLink}
      </Flex>
    );
  } else if (!agent) {
    body = (
      <EmptyStateCard
        title="Agent not found"
        description={`agent-manager on ${installation} knows no agent "${name}" in namespace "${namespace}".`}
        actions={backLink}
      />
    );
  } else {
    return (
      <EditAgentWizard
        key={`${installation}/${namespace}/${name}`}
        installation={installation}
        agent={agent}
        writeMode={writeMode ?? 'apply'}
        detailHref={detailHref}
        catalog={catalog.skills}
        platformHarness={info?.harness?.name}
      />
    );
  }

  return (
    <WizardFrame
      title="Edit agent"
      context="Customize / Agents"
      closeHref={detailHref ?? '/'}
    >
      {body}
    </WizardFrame>
  );
}

/**
 * The edit page's former address (`…/<installation>/<namespace>/<name>/edit`),
 * kept so a bookmark or an old link lands in the wizard.
 */
export function LegacyEditAgentRedirect() {
  const { installation = '', namespace = '', name = '' } = useParams();
  const agentEditLink = useRouteRef(agentEditRouteRef);
  const target = agentEditLink?.({ installation, namespace, name });
  return target ? <Navigate to={target} replace /> : null;
}
