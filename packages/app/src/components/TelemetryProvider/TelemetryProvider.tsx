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

  const testMode = window.location.hostname === 'localhost' || !telemetryConfig;

  const td = createTelemetryDeck({
    appID: telemetryConfig ? telemetryConfig.getString('appID') : 'test',
    salt: telemetryConfig ? telemetryConfig.getString('salt') : 'test',
    clientUser: backstageIdentity
      ? backstageIdentity.userEntityRef
      : 'anonymous',
    testMode,
  });

  return (
    <TelemetryDeckProvider telemetryDeck={td}>{children}</TelemetryDeckProvider>
  );
};
