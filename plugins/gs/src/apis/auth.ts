import {
  BackstageIdentityApi,
  ConfigApi,
  OAuthApi,
  OpenIdConnectApi,
  ProfileInfoApi,
  SessionApi,
  configApiRef,
  createApiFactory,
  createApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
} from "@backstage/core-plugin-api";
import { ScmAuth } from "@backstage/integration-react";
import { GiantSwarmIcon } from "../assets/icons/CustomIcons";
import { OAuth2 } from "@backstage/core-app-api";

const PROVIDER_NAME_PREFIX = 'oidc-';

type GSAuthApi = OAuthApi & OpenIdConnectApi & ProfileInfoApi & BackstageIdentityApi & SessionApi;

export const gsAuthApiRefs = {
  'oidc-glippy': createApiRef<GSAuthApi>({ id: 'auth.oidc-glippy' }),
  'oidc-golem': createApiRef<GSAuthApi>({ id: 'auth.oidc-golem' }),
  'oidc-snail': createApiRef<GSAuthApi>({ id: 'auth.oidc-snail' }),
} as const;

export type ProviderName = keyof typeof gsAuthApiRefs;

const providerNames = Object.keys(gsAuthApiRefs) as Array<ProviderName>;

export const isGSProvider = (providerName: string): providerName is ProviderName => {
  return providerName.startsWith(PROVIDER_NAME_PREFIX);
}

export const getProviderDisplayName = (providerName: ProviderName) => {
  return providerName.split(PROVIDER_NAME_PREFIX)[1];
}

export const getProviderInstallationName = (providerName: ProviderName): string => {
  return providerName.split(PROVIDER_NAME_PREFIX)[1];
}

export const getProviderInstallationConfig = (configApi: ConfigApi, providerName: ProviderName): ConfigApi | undefined => {
  const installationName = getProviderInstallationName(providerName);

  return configApi.getOptionalConfig(`gs.installations.${installationName}`)
}

export const gsAuthProviderFactories = providerNames.map((providerName) => {
  const apiRef = gsAuthApiRefs[providerName];

  return createApiFactory({
    api: apiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
      configApi: configApiRef,
    },
    factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
      OAuth2.create({
        discoveryApi,
        oauthRequestApi,
        provider: {
          id: providerName,
          title: getProviderDisplayName(providerName),
          icon: GiantSwarmIcon,
        },
        environment: configApi.getOptionalString('auth.environment'),
        defaultScopes: ['openid', 'profile', 'email', 'groups', 'offline_access', 'audience:server:client_id:dex-k8s-authenticator'],
        popupOptions: {
          size: {
            width: 600,
            height: 600,
          },
        },
      }),
  })
});

export const createScmAuthInstances = (
  gsAuthApis: { [key in ProviderName]: GSAuthApi },
  configApi: ConfigApi,
): ScmAuth[] => {
  return Object.entries(gsAuthApis).map(([providerName, gsAuthApi]) => {
    const installationConfig = getProviderInstallationConfig(configApi, providerName as ProviderName);
    const apiEndpoint = installationConfig?.getString('apiEndpoint');

    return ScmAuth.forAuthApi(gsAuthApi, {
      host: apiEndpoint?.replace('https://', '') ?? '',
      scopeMapping: {
        default: [],
        repoWrite: [],
      }
    });
  });
}
