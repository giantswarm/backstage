import type {
  DiscoveryApi,
  FetchApi,
  IdentityApi,
  StorageApi,
  StorageValueSnapshot,
} from '@backstage/core-plugin-api';
import type { SignalApi } from '@backstage/plugin-signals-react';
import type { JsonValue, Observable } from '@backstage/types';
import ObservableImpl from 'zen-observable';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  Accept: 'application/json',
};

/** The channel the user-settings backend announces a stored change on. */
const SIGNAL_CHANNEL = 'user-settings';

type Snapshot = StorageValueSnapshot<JsonValue>;
type Subscriber = ZenObservable.SubscriptionObserver<Snapshot>;

/** What one key of one bucket shares between its subscribers. */
type KeyState = {
  subscribers: Set<Subscriber>;
  signal?: { unsubscribe(): void };
  /** The number of the newest read or write started for the key. */
  started: number;
  /** The number of the newest one whose answer was handed out. */
  delivered: number;
};

export type RoamingSettingsStorageOptions = {
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
  identityApi: IdentityApi;
  /** Where values go while the person is not signed in. */
  fallback: StorageApi;
  /** Delivers the backend's change announcements to this tab. */
  signalApi?: SignalApi;
};

/**
 * A StorageApi on the user-settings backend
 * (`@backstage/plugin-user-settings-backend`), in place of the upstream
 * `UserSettingsStorage`, for values the portal reads and rewrites as a whole
 * (the agent platform's pins, favourites, notification record). It talks to
 * the same routes and the same `default.<bucket>` namespace, so the values
 * already stored stay where they are. It differs where a whole-value write
 * would otherwise erase what the person had:
 *
 * - **A read that failed is not "absent".** Upstream answers a failed read
 *   (offline, 5xx) as absent, and a write built on that replaces the stored
 *   value with only the new entry. Here only a 404 for the key is absent; a
 *   failed read is handed out as `presence: 'unknown'`, which a reader keeps
 *   its last value for and a writer refuses to write on.
 * - **Every read goes to the backend.** No answer is cached: a subscription
 *   and every change announced on the signals channel read the key afresh, so
 *   a writer that reads before it writes starts from what is stored now, and
 *   a change announced right after a read is not answered from that read.
 *
 * Answers are handed to every subscriber of the key, newest first: one that
 * arrives after a newer read or write has been handed out is dropped.
 * `snapshot` is always unknown, as upstream's: the value is read through a
 * subscription. While the person is not signed in, `fallback` (browser
 * storage) holds the values.
 */
export class RoamingSettingsStorage implements StorageApi {
  static create(options: RoamingSettingsStorageOptions) {
    return new RoamingSettingsStorage(options, 'default', options.fallback);
  }

  private readonly buckets = new Map<string, RoamingSettingsStorage>();
  private readonly keys = new Map<string, KeyState>();

  private constructor(
    private readonly options: RoamingSettingsStorageOptions,
    private readonly namespace: string,
    private readonly fallback: StorageApi,
  ) {}

  forBucket(name: string): StorageApi {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = new RoamingSettingsStorage(
        this.options,
        `${this.namespace}.${name}`,
        this.fallback.forBucket(name),
      );
      this.buckets.set(name, bucket);
    }
    return bucket;
  }

  snapshot<T extends JsonValue>(key: string): StorageValueSnapshot<T> {
    return { key, presence: 'unknown' };
  }

  observe$<T extends JsonValue>(
    key: string,
  ): Observable<StorageValueSnapshot<T>> {
    return new ObservableImpl<Snapshot>(subscriber => {
      const state = this.stateOf(key);
      state.subscribers.add(subscriber);
      if (!state.signal && this.options.signalApi) {
        state.signal = this.options.signalApi.subscribe(
          SIGNAL_CHANNEL,
          message => {
            if ((message as { key?: unknown }).key === key) {
              this.read(key);
            }
          },
        );
      }
      this.read(key);
      return () => {
        state.subscribers.delete(subscriber);
        if (state.subscribers.size === 0) {
          state.signal?.unsubscribe();
          state.signal = undefined;
        }
      };
    }) as unknown as Observable<StorageValueSnapshot<T>>;
  }

  async set<T extends JsonValue>(key: string, data: T): Promise<void> {
    const turn = this.start(key);
    if (!(await this.isSignedIn())) {
      await this.fallback.set(key, data);
      this.deliver(key, turn, { key, presence: 'present', value: data });
      return;
    }
    const response = await this.options.fetchApi.fetch(await this.urlOf(key), {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ value: data }),
    });
    if (!response.ok) {
      throw await failure(response, 'store');
    }
    const { value } = (await response.json()) as { value: JsonValue };
    this.deliver(key, turn, { key, presence: 'present', value });
  }

  async remove(key: string): Promise<void> {
    const turn = this.start(key);
    if (!(await this.isSignedIn())) {
      await this.fallback.remove(key);
      this.deliver(key, turn, { key, presence: 'absent' });
      return;
    }
    const response = await this.options.fetchApi.fetch(await this.urlOf(key), {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      throw await failure(response, 'remove');
    }
    this.deliver(key, turn, { key, presence: 'absent' });
  }

  /** Reads the key from the backend and hands the answer to its subscribers. */
  private async read(key: string): Promise<void> {
    const turn = this.start(key);
    this.deliver(key, turn, await this.fetchSnapshot(key));
  }

  private async fetchSnapshot(key: string): Promise<Snapshot> {
    try {
      if (!(await this.isSignedIn())) {
        return this.fallback.snapshot<JsonValue>(key);
      }
      const response = await this.options.fetchApi.fetch(await this.urlOf(key));
      if (response.status === 404) {
        return { key, presence: 'absent' };
      }
      if (!response.ok) {
        return { key, presence: 'unknown' };
      }
      const { value } = (await response.json()) as { value: JsonValue };
      return { key, presence: 'present', value };
    } catch {
      // Offline, or an answer that was not JSON: nothing is known.
      return { key, presence: 'unknown' };
    }
  }

  private stateOf(key: string): KeyState {
    let state = this.keys.get(key);
    if (!state) {
      state = { subscribers: new Set(), started: 0, delivered: 0 };
      this.keys.set(key, state);
    }
    return state;
  }

  private start(key: string): number {
    const state = this.stateOf(key);
    state.started += 1;
    return state.started;
  }

  private deliver(key: string, turn: number, snapshot: Snapshot) {
    const state = this.stateOf(key);
    if (turn < state.delivered) {
      // Overtaken: a newer read or write has been handed out.
      return;
    }
    state.delivered = turn;
    for (const subscriber of state.subscribers) {
      subscriber.next(snapshot);
    }
  }

  private async urlOf(key: string): Promise<string> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('user-settings');
    return `${baseUrl}/buckets/${encodeURIComponent(
      this.namespace,
    )}/keys/${encodeURIComponent(key)}`;
  }

  private async isSignedIn(): Promise<boolean> {
    try {
      const credentials = await this.options.identityApi.getCredentials();
      return Boolean(credentials?.token);
    } catch {
      return false;
    }
  }
}

async function failure(response: Response, action: string): Promise<Error> {
  const error = new Error(
    `Could not ${action} the setting: the settings backend answered ${response.status}.`,
  );
  error.name = 'UserSettingsWriteError';
  return error;
}
