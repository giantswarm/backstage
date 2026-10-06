import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';

/** Mints a fresh value for one template secret, e.g. a cluster token. */
export type SecretRefresher = () => Promise<string>;

type Registry = Map<string, SecretRefresher>;

const SecretRefreshContext = createContext<Registry | undefined>(undefined);

/**
 * Holds the refreshers that template fields register for secrets that expire,
 * so the wizard can mint fresh values when the person selects Create. Must sit
 * inside `SecretsContextProvider`.
 */
export function TemplateSecretRefreshProvider(props: { children: ReactNode }) {
  const registry = useRef<Registry>(new Map());
  return (
    <SecretRefreshContext.Provider value={registry.current}>
      {props.children}
    </SecretRefreshContext.Provider>
  );
}

/**
 * Registers how to mint a fresh value for `secretsKey`. The registration
 * outlives the field: the stepper unmounts a step's fields before the review
 * step, and their secrets still have to be refreshed on submit. A later
 * registration for the same key replaces the earlier one. Outside a
 * `TemplateSecretRefreshProvider` this does nothing.
 */
export function useRegisterSecretRefresher(
  secretsKey: string | undefined,
  refresh: SecretRefresher | undefined,
) {
  const registry = useContext(SecretRefreshContext);
  useEffect(() => {
    if (!registry || !secretsKey || !refresh) {
      return;
    }
    registry.set(secretsKey, refresh);
  }, [registry, secretsKey, refresh]);
}

/**
 * Returns a function that runs every registered refresher, stores the fresh
 * values in the template secrets and returns them. Callers pass the returned
 * values to the same `scaffold()` call, since the secrets state update is not
 * visible until the next render. Rejects when any refresher fails.
 */
export function useRefreshTemplateSecrets(): () => Promise<
  Record<string, string>
> {
  const registry = useContext(SecretRefreshContext);
  const { setSecrets } = useTemplateSecrets();

  return useCallback(async () => {
    if (!registry || registry.size === 0) {
      return {};
    }
    const entries = await Promise.all(
      Array.from(registry.entries()).map(
        async ([key, refresh]) => [key, await refresh()] as const,
      ),
    );
    const fresh = Object.fromEntries(entries);
    setSecrets(fresh);
    return fresh;
  }, [registry, setSecrets]);
}
