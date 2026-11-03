// This test runs in Node and reads the repository's app-config.yaml; nothing
// of it is bundled into the app.
// eslint-disable-next-line no-restricted-imports
import { resolve } from 'path';
import { ConfigSources, FileConfigSource } from '@backstage/config-loader';
import { createSpecializedApp } from '@backstage/frontend-app-api';
import appPlugin from '@backstage/plugin-app';
import { mockApis } from '@backstage/frontend-test-utils';
import {
  ApiHolder,
  ApiRef,
  configApiRef,
  identityApiRef,
} from '@backstage/frontend-plugin-api';
import { appFeatures, bindAppRoutes } from './App';

/**
 * Every id `app.extensions` names in the checked-in app-config.yaml -- the
 * base config every deployment starts from -- must belong to an extension the
 * app installs. The new frontend system reports an id that names none as
 * `INVALID_EXTENSION_CONFIG_KEY` ("Extension <id> does not exist") at start-up:
 * a warning today, a start-up failure once the check becomes strict. The same
 * code covers a config key an extension's schema does not declare, so this
 * test catches that too.
 */

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
  it('names only extensions the app installs, with config they declare', async () => {
    const config = await loadAppConfig('app-config.yaml');
    try {
      const app = createSpecializedApp({
        features: [appPlugin, ...appFeatures],
        config,
        bindRoutes: bindAppRoutes,
        // APIs handed in up front skip the sign-in phase, so the app
        // finalizes synchronously and reports what it collected.
        advanced: {
          apis: apiHolder(
            [configApiRef, config],
            [identityApiRef, mockApis.identity()],
          ),
        },
      });

      const invalid = (app.errors ?? [])
        .filter(error => error.code === 'INVALID_EXTENSION_CONFIG_KEY')
        .map(error => error.message);
      expect(invalid).toEqual([]);
    } finally {
      config.close();
    }
  });
});
