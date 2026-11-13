/**
 * An API whose every member is a required method that returns a promise, so a
 * call can wait for the implementation to load. Optional members are refused:
 * the wrapper cannot tell before loading whether one is there.
 */
export type AsyncApi<T> = {
  [K in keyof T]-?: (...args: any[]) => Promise<unknown>;
};

// Names that probe what kind of object something is, rather than call it:
// promise resolution, serialization, React and Jest's matchers. They are
// undefined on the wrapper, like the `Object.prototype` members and symbols are
// the plain object's own, so it resolves, converts, serializes and compares
// like a plain object.
const NOT_METHODS = new Set([
  'then',
  'toJSON',
  'asymmetricMatch',
  '$$typeof',
  'nodeType',
  '@@__IMMUTABLE_ITERABLE__@@',
  '@@__IMMUTABLE_RECORD__@@',
]);

/**
 * An API implementation that loads on its first call. API factories are
 * synchronous, so a factory that loads its implementation with a dynamic
 * `import()` returns this in its place. Each method name answers with one
 * function that waits for the load and calls the implementation's method. A
 * failed load is retried on the next call.
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

  const methods = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const method = (name: string) => {
    let fn = methods.get(name);
    if (!fn) {
      fn = async (...args: unknown[]) => {
        const api = await loaded();
        const member = api[name as keyof T];
        if (typeof member !== 'function') {
          throw new TypeError(`The loaded API has no method ${name}`);
        }
        return member.apply(api, args);
      };
      methods.set(name, fn);
    }
    return fn;
  };

  return new Proxy({} as T, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string' || prop in Object.prototype) {
        return Reflect.get(target, prop, receiver);
      }
      return NOT_METHODS.has(prop) ? undefined : method(prop);
    },
  });
}
