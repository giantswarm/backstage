import type { ReactNode } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  WizardFrame,
  type WizardStep,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentsRouteRef,
  newAgentRouteRef,
  newAgentSkillsRouteRef,
  newAgentToolsRouteRef,
} from '../../routes';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useAgentShell } from '../../hooks/useAgentShell';
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

/**
 * The create-agent wizard's chrome: the shared in-content wizard frame (header
 * with Close and the Details / Skills / Tools / Review step strip, sticky
 * footer with Cancel, Back and the step's own actions) around a centered
 * column — the same presentation as the connector wizard. The Skills step only
 * appears when skill repositories are configured, matching the routing. Each
 * step provides its primary button through `useProvidePageHeaderActions`.
 */
export function AgentWizardFrame({
  step,
  onBack,
  children,
}: {
  step: AgentWizardStepId;
  /** Shown as the footer's Back button; the first step passes none. */
  onBack?: () => void;
  children: ReactNode;
}) {
  const detailsLink = useRouteRef(newAgentRouteRef);
  const skillsLink = useRouteRef(newAgentSkillsRouteRef);
  const toolsLink = useRouteRef(newAgentToolsRouteRef);
  const closeHref = useAgentWizardCloseHref();
  const { hasRepositories } = useSkillCatalog();

  const steps: WizardStep[] = [
    { id: 'details', label: 'Details', href: detailsLink?.() },
    ...(hasRepositories
      ? [{ id: 'skills', label: 'Skills', href: skillsLink?.() }]
      : []),
    { id: 'tools', label: 'Tools', href: toolsLink?.() },
    { id: 'review', label: 'Review' },
  ];

  return (
    <WizardFrame
      title="New agent"
      context="Customize / Agents"
      steps={steps}
      currentStep={step}
      closeHref={closeHref}
      onBack={onBack}
      width="wide"
    >
      {children}
    </WizardFrame>
  );
}
