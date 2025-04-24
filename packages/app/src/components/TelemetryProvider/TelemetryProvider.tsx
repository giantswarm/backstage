import { useMemo } from 'react';
import {
  TelemetryDeckProvider,
  createTelemetryDeck,
} from '@typedigital/telemetrydeck-react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useUserProfile } from '@backstage/plugin-user-settings';
import { getGuestUserEntityRef } from '../../utils/telemetry';

function useClientUser() {
  const { backstageIdentity, profile } = useUserProfile();

  return useMemo(() => {
    if (!backstageIdentity) {
      return 'anonymous';
    }

    if (backstageIdentity?.userEntityRef === 'user:default/guest') {
      return getGuestUserEntityRef(profile);
    }

    return backstageIdentity.userEntityRef;
  }, [backstageIdentity, profile]);
}

export const TelemetryProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const clientUser = useClientUser();
  const configApi = useApi(configApiRef);
  const telemetryConfig = configApi.getOptionalConfig('app.telemetrydeck');

  const testMode = window.location.hostname === 'localhost' || !telemetryConfig;

  const td = createTelemetryDeck({
    appID: telemetryConfig ? telemetryConfig.getString('appID') : 'test',
    salt: telemetryConfig ? telemetryConfig.getString('salt') : 'test',
    clientUser,
    testMode,
  });

  return (
    <TelemetryDeckProvider telemetryDeck={td}>{children}</TelemetryDeckProvider>
  );
};
