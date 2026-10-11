import { useMemo, type ReactNode } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  WizardFrame,
  type WizardStep,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentEditRouteRef,
  agentsRouteRef,
  newAgentReviewRouteRef,
  newAgentRouteRef,
  newAgentSkillsRouteRef,
  newAgentToolsRouteRef,
} from '../../routes';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useAgentShell } from '../../hooks/useAgentShell';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';

/** The create-agent wizard's steps, in order (Skills only with repositories). */
export type AgentWizardStepId = 'details' | 'skills' | 'tools' | 'review';

/**
 * Where leaving the create-agent wizard lands: the shell's Customize screen's
 * Agents tab, or the classic chrome's agents list.
 */
export function useAgentWizardCloseHref(): string {
  const agentsLink = useRouteRef(agentsRouteRef);
  const agentShell = useAgentShell();
  return agentShell
    ? `${SHELL_CUSTOMIZE_PATH}/agents`
    : (agentsLink?.() ?? '/');
}

/** Where each step of the agent wizard lives, as route-ref-shaped functions. */
export type AgentWizardLinks = {
  details?: () => string;
  skills?: () => string;
  tools?: () => string;
  review?: () => string;
};

/**
 * The steps' addresses for the wizard as it is running: the create flow's
 * `/agent-platform/agents/new[/skills|/tools|/review]`, or, while editing,
 * `/agent-platform/agents/edit/<installation>/<namespace>/<name>[/…]`. Every
 * step navigates through these, so the same pages serve both.
 */
export function useAgentWizardLinks(): AgentWizardLinks {
  const { edit } = useNewAgentForm();
  const details = useRouteRef(newAgentRouteRef);
  const skills = useRouteRef(newAgentSkillsRouteRef);
  const tools = useRouteRef(newAgentToolsRouteRef);
  const review = useRouteRef(newAgentReviewRouteRef);
  const editRoute = useRouteRef(agentEditRouteRef);
  const installation = edit?.installation;
  const namespace = edit?.agent.namespace;
  const name = edit?.agent.name;
  return useMemo(() => {
    if (!installation || !namespace || !name) {
      return { details, skills, tools, review };
    }
    const base = editRoute?.({ installation, namespace, name });
    if (!base) {
      return {};
    }
    return {
      details: () => base,
      skills: () => `${base}/skills`,
      tools: () => `${base}/tools`,
      review: () => `${base}/review`,
    };
  }, [
    details,
    skills,
    tools,
    review,
    editRoute,
    installation,
    namespace,
    name,
  ]);
}

/**
 * The create-agent wizard's chrome: the shared in-content wizard frame (header
 * with Close and the Details / Skills / Tools / Review step strip, sticky
 * footer with Cancel, Back and the step's own actions) around a centered
 * column — the same presentation as the connector wizard. The Skills step only
 * appears when skill repositories are configured, matching the routing. Each
 * step provides its primary button through `useProvidePageHeaderActions`.
 * Editing an agent is the same wizard, titled "Edit agent" and closing to the
 * agent's page. Close and Cancel ask before discarding a dirty form
 * (`isDirty`), on every step.
 */
export function AgentWizardFrame({
  step,
  onBack,
  isProposed = false,
  rail,
  children,
}: {
  step: AgentWizardStepId;
  /** Shown as the footer's Back button; the first step passes none. */
  onBack?: () => void;
  /**
   * The review proposed the form as a pull request: the work is in it, so
   * leaving no longer asks.
   */
  isProposed?: boolean;
  /** A sticky overview beside the step, where there is room (`WizardFrame`). */
  rail?: ReactNode;
  children: ReactNode;
}) {
  const links = useAgentWizardLinks();
  const { edit, isDirty } = useNewAgentForm();
  const createCloseHref = useAgentWizardCloseHref();
  const closeHref = edit
    ? (edit.detailHref ?? createCloseHref)
    : createCloseHref;
  const { hasRepositories } = useSkillCatalog();

  const steps: WizardStep[] = [
    { id: 'details', label: 'Details', href: links.details?.() },
    ...(hasRepositories
      ? [{ id: 'skills', label: 'Skills', href: links.skills?.() }]
      : []),
    { id: 'tools', label: 'Tools', href: links.tools?.() },
    { id: 'review', label: 'Review' },
  ];

  return (
    <WizardFrame
      title={edit ? 'Edit agent' : 'New agent'}
      context={
        edit
          ? `Customize / Agents / ${edit.agent.displayName || edit.agent.name}`
          : 'Customize / Agents'
      }
      steps={steps}
      currentStep={step}
      closeHref={closeHref}
      confirmDiscard={isDirty && !isProposed}
      onBack={onBack}
      width="wide"
      rail={rail}
    >
      {children}
    </WizardFrame>
  );
}
