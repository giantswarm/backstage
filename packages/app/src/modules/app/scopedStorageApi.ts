import { WebStorage } from '@backstage/core-app-api';
import type {
  DiscoveryApi,
  ErrorApi,
  FetchApi,
  IdentityApi,
  StorageApi,
  StorageValueSnapshot,
} from '@backstage/core-plugin-api';
import type { SignalApi } from '@backstage/plugin-signals-react';
import type { JsonValue, Observable } from '@backstage/types';
import { RoamingSettingsStorage } from './RoamingSettingsStorage';

/**
 * The buckets kept per user in the backend
 * (`@backstage/plugin-user-settings-backend`), so they roam across browsers
 * and devices: the agent platform's own state (pinned sessions, favorite
 * agents, dismissed hints — `plugins/agent-platform/src/hooks`).
 */
export const USER_SETTINGS_BUCKETS: readonly string[] = ['agent-platform'];

/**
 * The app's StorageApi: the agent platform's bucket goes to the user-settings
 * backend, everything else (the classic portal's starred entities, home-page
 * visits, table columns, …) stays in WebStorage (localStorage) exactly as the
 * upstream default — so the classic portal keeps its behaviour and its data.
 * Nothing is migrated between the two.
 *
 * The user-settings side is `RoamingSettingsStorage`, created with the
 * signals API: the backend announces every change it stores (`user-settings`
 * channel, the changed key), and each subscribed key is read again on that
 * signal, so a write in one tab or on one device reaches every other open tab
 * of the person.
 *
 * It degrades on its own: while the person is not signed in it reads and
 * writes WebStorage; a read the backend does not answer is handed out as
 * "unknown" (never as "absent", which a whole-value write would then erase
 * the stored value with), and a write it does not take rejects, which callers
 * surface like any other failed write.
 */
export class ScopedStorageApi implements StorageApi {
  static create(options: {
    discoveryApi: DiscoveryApi;
    errorApi: ErrorApi;
    fetchApi: FetchApi;
    identityApi: IdentityApi;
    /** Delivers the backend's change announcements; without it a tab sees only its own writes. */
    signalApi?: SignalApi;
    /** Overridable for tests; the agent platform's bucket by default. */
    userSettingsBuckets?: readonly string[];
  }): ScopedStorageApi {
    const { userSettingsBuckets = USER_SETTINGS_BUCKETS, ...deps } = options;
    const webStorage = WebStorage.create({ errorApi: deps.errorApi });
    return new ScopedStorageApi(
      webStorage,
      RoamingSettingsStorage.create({ ...deps, fallback: webStorage }),
      new Set(userSettingsBuckets),
    );
  }

  private constructor(
    private readonly webStorage: StorageApi,
    private readonly userSettingsStorage: StorageApi,
    private readonly userSettingsBuckets: ReadonlySet<string>,
  ) {}

  forBucket(name: string): StorageApi {
    return this.userSettingsBuckets.has(name)
      ? this.userSettingsStorage.forBucket(name)
      : this.webStorage.forBucket(name);
  }

  snapshot<T extends JsonValue>(key: string): StorageValueSnapshot<T> {
    return this.webStorage.snapshot<T>(key);
  }

  set<T extends JsonValue>(key: string, data: T): Promise<void> {
    return this.webStorage.set<T>(key, data);
  }

  remove(key: string): Promise<void> {
    return this.webStorage.remove(key);
  }

  observe$<T extends JsonValue>(
    key: string,
  ): Observable<StorageValueSnapshot<T>> {
    return this.webStorage.observe$<T>(key);
  }
}
