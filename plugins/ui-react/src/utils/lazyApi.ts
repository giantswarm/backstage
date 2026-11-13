/**
 * An API whose every member is a method that returns a promise, so a call can
 * wait for the implementation to load.
 */
export type AsyncApi<T> = {
  [K in keyof T]: (...args: any[]) => Promise<unknown>;
};

/**
 * An API implementation that loads on its first call. API factories are
 * synchronous, so a factory that loads its implementation with a dynamic
 * `import()` returns this in its place. A failed load is retried on the next
 * call.
 *
 * The fixture modes use it: see `docs/fixtures.md`.
 */
export function lazyApi<T extends AsyncApi<T>>(load: () => Promise<T>): T {
  let loading: Promise<T> | undefined;
  const loaded = () => {
    loading ??= load().catch(error => {
      loading = undefined;
      throw error;
    });
    return loading;
  };
  return new Proxy({} as T, {
    get(_target, prop) {
      // Not a thenable: awaiting the API returns the API.
      if (typeof prop !== 'string' || prop === 'then') {
        return undefined;
      }
      return async (...args: unknown[]) => {
        const api = await loaded();
        const method = api[prop as keyof T];
        if (typeof method !== 'function') {
          throw new TypeError(`The loaded API has no method ${prop}`);
        }
        return method.apply(api, args);
      };
    },
  });
}
