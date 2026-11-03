// This test reads the repository's app-config.yaml from disk; it is a test
// file and never bundled into the app.
// eslint-disable-next-line no-restricted-imports
import { resolve } from 'path';
import { ConfigSources, FileConfigSource } from '@backstage/config-loader';
import { createSpecializedApp } from '@backstage/frontend-app-api';
import {
  ApiHolder,
  ApiRef,
  configApiRef,
  identityApiRef,
} from '@backstage/frontend-plugin-api';
import { mockApis } from '@backstage/frontend-test-utils';
import appPlugin from '@backstage/plugin-app';
import { appFeatures, bindAppRoutes } from './appFeatures';

/**
 * What the checked-in app-config.yaml -- the base config every deployment
 * starts from -- says under `app.extensions` must fit the app's extensions.
 * The new frontend system reports two kinds of misfit at start-up:
 *
 * - `INVALID_EXTENSION_CONFIG_KEY`: an id that names no extension the app
 *   installs ("Extension <id> does not exist"). `createApp` logs it as a
 *   console warning today; it becomes a start-up failure once the check is
 *   strict.
 * - `EXTENSION_CONFIGURATION_INVALID`: an extension's `config` that its config
 *   schema rejects (a wrong type, or a key a strict schema does not declare).
 *   `createApp` shows the "App startup failed" page for it. A key that a
 *   non-strict schema does not declare (most blueprints', `PageBlueprint`'s
 *   among them) is dropped without any report, so no test can see it here.
 *
 * The second is reported when an extension is instantiated, so it covers the
 * extensions the app instantiates here: enabled ones whose `if` holds without a
 * signed-in person's context (feature flags, permissions).
 */
const STARTUP_CODES = [
  'INVALID_EXTENSION_CONFIG_KEY',
  'EXTENSION_CONFIGURATION_INVALID',
];

const REPO_ROOT = resolve(__dirname, '../../..');

async function loadAppConfig(file: string) {
  const source = FileConfigSource.create({
    path: resolve(REPO_ROOT, file),
    // `${VERSION}` and friends: only `app.extensions` matters here.
    substitutionFunc: async () => 'test',
  });
  return ConfigSources.toConfig(source);
}

function apiHolder(...pairs: [ApiRef<unknown>, unknown][]): ApiHolder {
  const byId = new Map(pairs.map(([ref, impl]) => [ref.id, impl]));
  return { get: <T>(ref: ApiRef<T>) => byId.get(ref.id) as T | undefined };
}

describe('app.extensions in app-config.yaml', () => {
  it('names only extensions the app installs, with config their schemas accept', async () => {
    const config = await loadAppConfig('app-config.yaml');
    // Building every plugin's extension tree warns about much that is not this
    // test's concern (deprecated config schemas, attachments to inputs a page
    // does not have); the reports this test checks come back in `errors`.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // `createSpecializedApp` is deprecated in favour of
      // `prepareSpecializedApp`, which `createApp` uses. It is still the only
      // public way to finalize the app without its sign-in page: APIs handed
      // in up front (`advanced.apis`) stand in for a signed-in session. The
      // replacement takes a `sessionState`, which only a finalized app hands
      // out. When the deprecated function goes, finalize a throwaway app
      // without a sign-in page with `prepareSpecializedApp` and pass its
      // `sessionState` here.
      //
      // `createApp` also discovers features (`app.packages`) and resolves
      // feature loaders before it prepares the app. This app does neither, so
      // `[appPlugin, ...appFeatures]` is the whole list; with discovery on,
      // the discovered plugins would have to be added here too.
      const app = createSpecializedApp({
        features: [appPlugin, ...appFeatures],
        config,
        bindRoutes: bindAppRoutes,
        advanced: {
          apis: apiHolder(
            [configApiRef, config],
            [identityApiRef, mockApis.identity()],
          ),
        },
      });

      const reports = (app.errors ?? [])
        .filter(error => STARTUP_CODES.includes(error.code))
        .map(error => `${error.code}: ${error.message}`);
      expect(reports).toEqual([]);
    } finally {
      warn.mockRestore();
      config.close();
    }
  });
});
