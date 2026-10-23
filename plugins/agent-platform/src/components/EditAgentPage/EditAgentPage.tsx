import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Flex } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import {
  HelmRelease,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  EmptyStateCard,
  LoadingIndicator,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  useAgentManagerAvailability,
  useAgentManagerInfo,
} from '../../hooks/useAgentManager';
import { useAgentCommitCheck } from '../../hooks/useAgentCommitCheck';
import { useAgentManagerAgent } from '../../hooks/useAgentManagerAgent';
import { useCloseHref } from '../../hooks/useCloseHref';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { formStateOfAgent } from '../../lib/agentEdit';
import type { AgentManagerAgent, WriteMode } from '../../lib/agentManager';
import type { DiscoveredSkill } from '../../lib/skills';
import type { DiscoveredPlugin } from '../../lib/plugins';
import { musterAgentManagerAgentQueryKey } from '../../lib/queryKeys';
import { tenantInSentence } from '../../lib/tenants';
import { agentDetailRouteRef } from '../../routes';
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
import { MissingReleaseFileAlert } from '../MissingReleaseFileAlert';

/**
 * The wizard, seeded once from agent-manager's reading of the agent — one read
 * after the page mounted, never a cached one (`freshOnMount`) — into its own
 * form state (the create flow's draft, held by the router's provider, stays
 * untouched) and the agent as the baseline the review compares against. A
 * later re-read of the agent does not reseed what the person is changing.
 * `onOpened` runs once it is on screen.
 */
function EditAgentWizard({
  installation,
  agent,
  writeMode,
  detailHref,
  catalog,
  pluginCatalog,
  platformHarness,
  onOpened,
}: {
  installation: string;
  agent: AgentManagerAgent;
  writeMode: WriteMode;
  detailHref: string | undefined;
  catalog: DiscoveredSkill[];
  pluginCatalog: DiscoveredPlugin[];
  platformHarness: string | undefined;
  onOpened: () => void;
}) {
  useEffect(onOpened, [onOpened]);
  const [seed] = useState(() => ({
    edit: { agent, installation, writeMode, detailHref },
    state: formStateOfAgent(agent, {
      installation,
      catalog,
      pluginCatalog,
      platformHarness,
    }),
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
 * Edit an agent (`/customize/agents/<installation>/<namespace>/<name>/edit`
 * and its `/skills`, `/tools`, `/review` steps): the create wizard, prefilled.
 * Like `EditSkillPage` for skills, this page only reads what the wizard needs
 * — agent-manager's `get_agent` (its availability and, for an agent applied
 * from git, the commit capability, decide whether there is a form at all) and
 * the skill catalog the skills step matches the agent's pins against — and
 * then hands over to the wizard's own steps in edit mode: same plain-first
 * fields, model and runtime under More options showing the agent's own, and a
 * review that saves only what changed (`update_agent`, or a pull request for
 * an agent applied from git).
 *
 * For an agent applied from git it also asks, before the form, whether
 * agent-manager can open that pull request at all (`useAgentCommitCheck`): an
 * agent defined outside agent-manager's directory gets an explanation instead
 * of a form, and a missing GitHub authorization the connect step, so nobody
 * fills in a form whose save is refused. Any other failure of that check
 * opens the form, and the review reports the save's own answer.
 */
export function EditAgentPage() {
  const { installation = '', namespace = '', name = '' } = useParams();
  const agentDetailLink = useRouteRef(agentDetailRouteRef);
  const detailHref = agentDetailLink?.({ installation, namespace, name });
  const closeHref = useCloseHref(detailHref);

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
  // A live save runs as the person against the agent's HelmRelease, so a
  // deep link from someone who may not update it answers with the refusal
  // up front rather than at the end of the wizard. Not where agent-manager
  // writes as its ServiceAccount.
  const asksAccess =
    writeMode === 'apply' && info?.identity !== 'serviceAccount';
  const updateAccess = useSelfSubjectAccessReview(
    installation,
    {
      group: HelmRelease.group,
      resource: HelmRelease.plural,
      namespace: agent?.helmRelease?.namespace ?? namespace,
      name: agent?.helmRelease?.name ?? name,
      verb: 'update',
    },
    { enabled: asksAccess },
  );
  // Asked alongside `get_agent` where the agent is already known to be applied
  // from git — a reading the detail page cached, which the wizard is never
  // seeded from — and otherwise once the fresh reading says so.
  const queryClient = useQueryClient();
  const knownAgent =
    agent ??
    queryClient.getQueryData<AgentManagerAgent>(
      musterAgentManagerAgentQueryKey(installation, namespace, name),
    );
  const commitCheck = useAgentCommitCheck(
    installation,
    namespace,
    name,
    presence === 'available' && canCommit && knownAgent?.managed === 'gitops',
  );
  // Asked once, before the form: a later re-read (every muster sign-in reads
  // all muster queries again) never takes away a form the person is filling.
  // Latched by the wizard's mount, so only a form that reached the screen
  // counts.
  const wizardKey = `${installation}/${namespace}/${name}`;
  const [wizardOpenedFor, setWizardOpenedFor] = useState<string>();
  const onWizardOpened = useCallback(
    () => setWizardOpenedFor(wizardKey),
    [wizardKey],
  );
  const commitGates = writeMode === 'commit' && wizardOpenedFor !== wizardKey;
  const isCommitCheckPending = commitGates && commitCheck.status === 'checking';
  const reason = agentManagerAbsenceReason(
    { ...gate, isGitOpsOwned: isGitOpsOwned && !canCommit },
    installation,
  );
  // The skills step selects the agent's pins on the catalog's cards, so the
  // wizard waits for the catalog (a failed one leaves every pin as it is).
  const isCatalogPending = catalog.isLoading && catalog.skills.length === 0;

  const shownName = agent?.displayName || agent?.name || name;

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
  } else if (presence === 'unknown' && !availability.isLoading) {
    // Settled without an answer: muster's server list or the portal's muster
    // installations could not be read, so a spinner would never end.
    body = (
      <EmptyStateCard
        title="This agent cannot be edited from here"
        description={`Could not check ${installation} for agent-manager. Sign in to muster there, or try again later.`}
        actions={backLink}
      />
    );
  } else if (
    presence === 'unknown' ||
    gate.isVerdictPending ||
    (asksAccess && updateAccess.isLoading) ||
    isCommitCheckPending ||
    (agent && isCatalogPending)
  ) {
    body = <LoadingIndicator label="Reading the agent…" />;
  } else if (
    asksAccess &&
    !updateAccess.allowed &&
    failure?.kind !== 'not-connected'
  ) {
    // Before the read's failure: a person without the role may not read the
    // agent's HelmRelease either, so agent-manager's get_agent fails as them,
    // and the refusal is the answer that says why. Not before a muster
    // session that must first connect to agent-manager: that is the answer
    // then, and agent-manager may write as its ServiceAccount there.
    body = (
      <EmptyStateCard
        title="You cannot change this agent"
        description={`Changing the agents of ${tenantInSentence(
          namespace,
        )} needs the agent-platform:editor role in its namespace, which your platform team grants.`}
        actions={backLink}
      />
    );
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
  } else if (commitGates && commitCheck.status === 'release-outside') {
    body = (
      <MissingReleaseFileAlert
        missing={commitCheck.missing}
        message={commitCheck.message}
        action="edit"
        variant="page"
        actions={backLink}
      />
    );
  } else if (commitGates && commitCheck.status === 'connect') {
    // Once the sign-in lands every muster query is read again, this check
    // with them, and the form opens when it passes.
    body = (
      <Flex direction="column" gap="3">
        <ConnectAgentManagerAlert
          installation={installation}
          message={commitCheck.message}
          action="Agents applied from Git are edited"
          needsGitHub={commitCheck.github}
        />
        {backLink}
      </Flex>
    );
  } else {
    return (
      <EditAgentWizard
        key={wizardKey}
        installation={installation}
        agent={agent}
        writeMode={writeMode ?? 'apply'}
        detailHref={detailHref}
        catalog={catalog.skills}
        pluginCatalog={catalog.plugins}
        platformHarness={info?.harness?.name}
        onOpened={onWizardOpened}
      />
    );
  }

  return (
    // Named like the wizard it hands over to, so neither the document title
    // nor the context line shifts when it does.
    <WizardFrame
      title="Edit agent"
      documentTitle={[`Edit ${shownName}`, 'Agents']}
      context={`Customize / Agents / ${shownName}`}
      closeHref={closeHref}
    >
      {body}
    </WizardFrame>
  );
}
