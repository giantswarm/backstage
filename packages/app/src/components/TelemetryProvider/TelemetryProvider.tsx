import React from 'react';
import {
  TelemetryDeckProvider,
  createTelemetryDeck,
} from '@typedigital/telemetrydeck-react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useUserProfile } from '@backstage/plugin-user-settings';

export const TelemetryProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { backstageIdentity } = useUserProfile();
  const configApi = useApi(configApiRef);
  const telemetryConfig = configApi.getOptionalConfig('app.telemetrydeck');

  if (!telemetryConfig || !backstageIdentity) {
    return children;
  }

  const td = createTelemetryDeck({
    appID: telemetryConfig.getString('appID'),
    salt: telemetryConfig.getString('salt'),
    clientUser: backstageIdentity.userEntityRef,
  });

  return (
    <TelemetryDeckProvider telemetryDeck={td}>{children}</TelemetryDeckProvider>
  );
};
