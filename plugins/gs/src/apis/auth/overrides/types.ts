/*
 * This is copy of the https://github.com/backstage/backstage/blob/v1.32.5/packages/core-app-api/src/apis/implementations/auth/types.ts
 */

/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  AuthProviderInfo,
  ConfigApi,
  DiscoveryApi,
  OAuthRequestApi,
} from '@backstage/core-plugin-api';

/**
 * Create options for OAuth APIs.
 * @public
 */
export type OAuthApiCreateOptions = AuthApiCreateOptions & {
  oauthRequestApi: OAuthRequestApi;
  defaultScopes?: string[];
};

/**
 * Generic create options for auth APIs.
 * @public
 */
export type AuthApiCreateOptions = {
  discoveryApi: DiscoveryApi;
  environment?: string;
  provider?: AuthProviderInfo;
  configApi?: ConfigApi;
};
