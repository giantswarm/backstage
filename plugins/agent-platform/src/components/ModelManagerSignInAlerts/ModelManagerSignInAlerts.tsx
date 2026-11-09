import { useQueryClient } from '@tanstack/react-query';

import { MODEL_MANAGER_SERVER } from '../../lib/modelManagerBackends';
import { isModelManagerQueryOf } from '../../lib/queryKeys';
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
 * sign-in lands, every model-manager read of the installation is read again,
 * and polling resumes with the first answer.
 */
export function ModelManagerSignInAlerts({
  installations,
}: ModelManagerSignInAlertsProps) {
  const queryClient = useQueryClient();
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
          onSignedIn={() =>
            void queryClient.invalidateQueries({
              predicate: isModelManagerQueryOf(installation),
            })
          }
        />
      ))}
    </>
  );
}
