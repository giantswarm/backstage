import { useInvalidateModelManagerReadsFor } from '../../hooks/useServedModelAction';
import { MODEL_MANAGER_SERVER } from '../../lib/modelManagerBackends';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';

export type ModelManagerSignInAlertsProps = {
  /**
   * The installations whose model-manager muster asked the person to sign
   * in to (`signInRequiredInstallations` of the serving snapshot).
   */
  installations: string[];
};

/**
 * In place of the read warning for an installation whose model-manager the
 * person has not signed in to: muster's sign-in, one card per installation.
 * The reads stop polling on that answer (`musterPollingOptions`); once the
 * sign-in lands, every read a model-manager operation can change is read
 * again (`useInvalidateModelManagerReadsFor`), and polling resumes with the
 * first answer.
 */
export function ModelManagerSignInAlerts({
  installations,
}: ModelManagerSignInAlertsProps) {
  const invalidate = useInvalidateModelManagerReadsFor();
  return (
    <>
      {installations.map(installation => (
        <ConnectAgentManagerAlert
          key={installation}
          installation={installation}
          message=""
          signInRequired
          action="Served models are read"
          server={MODEL_MANAGER_SERVER}
          onSignedIn={() => void invalidate(installation)}
        />
      ))}
    </>
  );
}
