import type { ReactNode } from 'react';
import {
  WizardFrame,
  type WizardStep,
} from '@giantswarm/backstage-plugin-ui-react';

import { connectorDisplayNameOn } from '../../lib/serverGrouping';
import { useMusterInstance } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import {
  useConnectorsListHref,
  useConnectorWizardLinks,
} from '../NewMcpServerEditGate';
import { useServerPageLinks } from '../shared';

/** The shell connector wizard's three steps, in order. */
export type ConnectorWizardStepId = 'connect' | 'signin' | 'test';

/**
 * Where leaving the shell connector wizard lands. An edit — a run seeded from
 * a registered connector, its Edit — goes back to that connector's page,
 * where it started. A registration goes to the Customize screen's Connectors
 * tab's own list, Your connectors (also where it goes on after "Add
 * connector", so "Done" ends where adding began).
 */
export function useConnectorWizardCloseHref(): string {
  const connectors = useConnectorsListHref();
  const pageLinks = useServerPageLinks();
  const { registeredName, registeredInstallation, lastSave } =
    useNewMcpServerForm();
  // Set together, so both are there for an edit.
  const editedPage =
    registeredName && registeredInstallation && lastSave !== 'create'
      ? pageLinks.server(registeredName, registeredInstallation)
      : undefined;
  if (editedPage) {
    return editedPage;
  }
  // A registered connector carries no tool-group label: it is listed on
  // Your connectors, the Connectors tab's default sub-tab.
  return connectors;
}

/**
 * The agent-platform shell's connector registration wizard chrome: the
 * in-content wizard frame (header with Close and the Connect / Sign-in / Test
 * step strip, sticky footer with Cancel, Back and the step's own actions)
 * around a centered column — the rail stays visible beside it. Each step page
 * provides its primary buttons through `useProvidePageHeaderActions`; the
 * frame renders them in its footer and claims the page header, so the
 * surrounding layout draws none.
 */
export function ConnectorWizardFrame({
  step,
  onBack,
  children,
}: {
  step: ConnectorWizardStepId;
  /** Shown as the footer's Back button; the first step passes none. */
  onBack?: () => void;
  children: ReactNode;
}) {
  const wizardLinks = useConnectorWizardLinks();
  const closeHref = useConnectorWizardCloseHref();
  const { registeredName, registeredInstallation } = useNewMcpServerForm();
  const { mcpServers } = useMusterInstance();
  // What people call the connector being edited, on the installation it was
  // registered on; links keep its name.
  const shownName = registeredName
    ? connectorDisplayNameOn(mcpServers, registeredInstallation, registeredName)
    : undefined;

  const edited = { name: registeredName, installation: registeredInstallation };
  const steps: WizardStep[] = [
    {
      id: 'connect',
      label: 'Connect',
      href: wizardLinks('connect', edited),
    },
    {
      id: 'signin',
      label: 'Sign-in',
      href: wizardLinks('auth', edited),
    },
    { id: 'test', label: 'Test' },
  ];

  return (
    <WizardFrame
      // Like every edit frame: the action in the h1, the resource in the
      // context line and the document title.
      title={registeredName ? 'Edit connector' : 'Add connector'}
      documentTitle={
        shownName ? [`Edit ${shownName}`, 'Connectors'] : undefined
      }
      context={
        shownName
          ? `Customize / Connectors / ${shownName}`
          : 'Customize / Connectors'
      }
      steps={steps}
      currentStep={step}
      closeHref={closeHref}
      onBack={onBack}
    >
      {children}
    </WizardFrame>
  );
}
