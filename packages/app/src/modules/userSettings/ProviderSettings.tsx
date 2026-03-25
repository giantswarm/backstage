import { lazy } from 'react';
import {
  createExtension,
  coreExtensionData,
} from '@backstage/frontend-plugin-api';

const LazyProviderSettings = lazy(async () => {
  const [{ DefaultProviderSettings }, { GSProviderSettings }] =
    await Promise.all([
      import('@backstage/plugin-user-settings'),
      import('@giantswarm/backstage-plugin-gs'),
    ]);

  return {
    default: () => (
      <>
        <DefaultProviderSettings configuredProviders={['github']} />
        <GSProviderSettings />
      </>
    ),
  };
});

export const ProviderSettings = createExtension({
  name: 'provider-settings',
  attachTo: {
    id: 'sub-page:user-settings/auth-providers',
    input: 'providerSettings',
  },
  output: [coreExtensionData.reactElement],
  factory() {
    return [coreExtensionData.reactElement(<LazyProviderSettings />)];
  },
});
