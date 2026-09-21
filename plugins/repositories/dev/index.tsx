import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
// The dev app is the app: the page's @backstage/ui controls need the
// package's stylesheet, which packages/app imports; the rule guards the
// published plugin bundle, and dev/ is not part of it.
// eslint-disable-next-line @backstage/no-ui-css-imports-in-non-frontend
import '@backstage/ui/css/styles.css';
import { ConfigReader } from '@backstage/config';
import { IdentityApi, SignInPageProps } from '@backstage/core-plugin-api';
import { createApp } from '@backstage/frontend-defaults';
import {
  ApiBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { repositoriesApiRef } from '../src/apis';
import { createInMemoryApi } from '../src/fixtures/inMemoryApi';
import { records, refusedPlan } from '../src/fixtures/records';
import { repositoriesPlugin } from '../src/plugin';

/**
 * The Repositories page over the fixture records, without a backend or a
 * manager: `yarn start` in this package serves it at http://localhost:3000.
 * The page's pieces are new-frontend-system blueprints, so the app is the
 * one `packages/app` builds -- `createApp` with the plugin and a module that
 * swaps its API for the in-memory one -- rather than `createDevApp`, which
 * cannot resolve their route refs. The caller is a Bumblebee member; the
 * inventory holds two teams, an undeclared repository, a deprecated one, a
 * declared-archived one, an undeclared fork GitHub archived and one whose
 * declaration the engine refused.
 */
const inMemoryApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: repositoriesApiRef,
      deps: {},
      factory: () =>
        createInMemoryApi({
          teams: ['team-bumblebee'],
          records: { ...records, [refusedPlan.repository]: refusedPlan },
        }),
    }),
});

/** The fixtures' caller, signed in without an auth backend. */
const alice: IdentityApi = {
  getProfileInfo: async () => ({
    displayName: 'Alice',
    email: 'alice@example.com',
  }),
  getBackstageIdentity: async () => ({
    type: 'user',
    userEntityRef: 'user:default/alice',
    ownershipEntityRefs: ['user:default/alice', 'group:default/team-bumblebee'],
  }),
  getCredentials: async () => ({}),
  signOut: async () => {},
};

function SignInAsAlice({ onSignInSuccess }: SignInPageProps) {
  useEffect(() => onSignInSuccess(alice), [onSignInSuccess]);
  return null;
}

const signIn = SignInPageBlueprint.make({
  params: { loader: async () => SignInAsAlice },
});

const app = createApp({
  features: [
    repositoriesPlugin,
    createFrontendModule({
      pluginId: 'repositories',
      extensions: [inMemoryApi],
    }),
    createFrontendModule({ pluginId: 'app', extensions: [signIn] }),
  ],
  advanced: {
    configLoader: async () => ({
      config: new ConfigReader({
        app: {
          title: 'Repositories (dev)',
          baseUrl: 'http://localhost:3000',
          extensions: ['page:repositories', 'api:repositories'],
        },
        backend: { baseUrl: 'http://localhost:7007' },
      }),
    }),
  },
});

createRoot(document.getElementById('root')!).render(app.createRoot());
