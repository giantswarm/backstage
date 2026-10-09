import type { ReactNode } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { makeStyles } from '@material-ui/core';
import {
  FullScreenWizardFrame,
  type WizardStep,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  customizeExternalRouteRef,
  mcpServersRouteRef,
  newMcpServerAuthRouteRef,
  newMcpServerRouteRef,
} from '../../routes';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { withEditParam } from '../NewMcpServerEditGate';

const NARROW_BREAKPOINT = 720;

const useStyles = makeStyles({
  column: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '40px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      padding: '24px 16px',
    },
  },
});

/** The shell connector wizard's three steps, in order. */
export type ConnectorWizardStepId = 'connect' | 'signin' | 'test';

/**
 * Where leaving the shell connector wizard lands: the Customize screen's
 * Connectors tab when the app binds it, else the connectors list.
 */
export function useConnectorWizardCloseHref(): string {
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const serversLink = useRouteRef(mcpServersRouteRef);
  const customize = customizeRoute?.();
  return customize ? `${customize}/connectors` : (serversLink?.() ?? '/');
}

/**
 * The agent-platform shell's connector registration wizard chrome: the
 * full-screen frame (header with Close and the Connect / Sign-in / Test step
 * strip, sticky footer with Cancel, Back and the step's own actions) around a
 * centered column. Each step page provides its primary buttons through
 * `useProvidePageHeaderActions`, exactly like the classic steps do — the frame
 * renders them in its footer and claims the page header, so the surrounding
 * layout draws none.
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
  const classes = useStyles();
  const connectLink = useRouteRef(newMcpServerRouteRef);
  const signInLink = useRouteRef(newMcpServerAuthRouteRef);
  const closeHref = useConnectorWizardCloseHref();
  const { registeredName } = useNewMcpServerForm();

  const steps: WizardStep[] = [
    {
      id: 'connect',
      label: 'Connect',
      href: connectLink && withEditParam(connectLink(), registeredName),
    },
    {
      id: 'signin',
      label: 'Sign-in',
      href: signInLink && withEditParam(signInLink(), registeredName),
    },
    { id: 'test', label: 'Test' },
  ];

  return (
    <FullScreenWizardFrame
      title={
        registeredName ? `Edit connector: ${registeredName}` : 'Add connector'
      }
      context="Customize / Connectors"
      steps={steps}
      currentStep={step}
      closeHref={closeHref}
      onBack={onBack}
    >
      <div className={classes.column}>{children}</div>
    </FullScreenWizardFrame>
  );
}
