import { useCallback, useEffect, useRef, useState } from 'react';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';

/** Every draft's storage key starts so, like `useTableColumns`' `gs-` keys. */
const KEY_PREFIX = 'gs-draft';

/**
 * Where the draft `name` of the person `userEntityRef` is kept in the tab's
 * `sessionStorage`. Exported for tests and for a flow that clears a draft
 * from outside its form.
 */
export function sessionDraftStorageKey(
  name: string,
  userEntityRef: string,
): string {
  return `${KEY_PREFIX}:${name}:${userEntityRef}`;
}

type StoredDraft = { version: number; value: unknown };

function readDraft(key: string, version: number): unknown {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) {
      return undefined;
    }
    const parsed = JSON.parse(stored) as Partial<StoredDraft> | null;
    if (parsed?.version === version && parsed.value !== undefined) {
      return parsed.value;
    }
    // Another shape than this build reads: drop it rather than guess.
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked, or not JSON: nothing to restore.
  }
  return undefined;
}

function writeDraft(key: string, version: number, value: unknown): void {
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ version, value } satisfies StoredDraft),
    );
  } catch {
    // Storage blocked or full: the form works on, without a draft.
  }
}

function removeDraft(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: there is nothing stored either.
  }
}

export type UseSessionDraftOptions<T> = {
  /**
   * What the draft is of, e.g. `agent-platform-new-agent`; with the signed-in
   * person's entity ref it makes the storage key. `undefined` keeps no draft
   * (an edit flow that starts from the saved object, say).
   */
  name: string | undefined;
  /**
   * What to keep: plain JSON data only, and never a secret or a token. It is
   * written on every change while {@link isDirty}.
   */
  value: T;
  /**
   * The value holds input of the person's own. While false the stored draft
   * is removed: an untouched form leaves nothing behind.
   */
  isDirty: boolean;
  /**
   * Bumped when the value's shape changes: a draft stored by another version
   * is dropped instead of restored.
   */
  version?: number;
  /**
   * Called once, when a stored draft is found, with its value: the form takes
   * it as its state. Called in the same update that sets `isLoaded`, so a
   * form gated on `isLoaded` never renders empty first.
   */
  onRestore: (value: T) => void;
};

export type SessionDraft = {
  /**
   * The person and their stored draft are known (at once without a `name`).
   * A form whose later steps send an incomplete state back to the first one
   * waits for this, so a reload on a later step stays there.
   */
  isLoaded: boolean;
  /** A stored draft was found and handed to `onRestore`. */
  wasRestored: boolean;
  /**
   * Removes the stored draft (after a successful submit, or a discard). The
   * next change of the value is kept again, as new work.
   */
  clear: () => void;
};

type Loaded = { key: string | undefined; restored: boolean };

const NO_DRAFT: Loaded = { key: undefined, restored: false };

/**
 * Keeps a form's draft in the tab's `sessionStorage`, per person, and hands
 * it back when the form mounts again: after a reload, a sign-in redirect, the
 * browser's Back, or a link followed in the same tab. `sessionStorage` is the
 * tab's own, so two tabs never share a draft, and it goes with the tab; the
 * person's entity ref in the key keeps two people on one browser apart.
 *
 * The form owns its state and passes it in; this hook only stores and
 * restores it. It does not tell the person: show `DraftRestoredAlert` while
 * `wasRestored`, with a way to start over that calls `clear`.
 */
export function useSessionDraft<T>({
  name,
  value,
  isDirty,
  version = 1,
  onRestore,
}: UseSessionDraftOptions<T>): SessionDraft {
  const identityApi = useApi(identityApiRef);
  const [loaded, setLoaded] = useState<Loaded | undefined>(
    name ? undefined : NO_DRAFT,
  );
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (!name) {
      setLoaded(NO_DRAFT);
      return undefined;
    }
    let cancelled = false;
    identityApi
      .getBackstageIdentity()
      .then(
        identity => identity.userEntityRef,
        () => undefined,
      )
      .then(userEntityRef => {
        if (cancelled) {
          return;
        }
        // Without a person there is no key that keeps people apart: no draft.
        const key = userEntityRef
          ? sessionDraftStorageKey(name, userEntityRef)
          : undefined;
        const stored = key ? readDraft(key, version) : undefined;
        if (stored !== undefined) {
          onRestoreRef.current(stored as T);
        }
        setLoaded({ key, restored: stored !== undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [identityApi, name, version]);

  const key = loaded?.key;
  // Not before the stored draft is read: the form's first, empty value would
  // remove it.
  useEffect(() => {
    if (!key) {
      return;
    }
    if (isDirty) {
      writeDraft(key, version, value);
    } else {
      removeDraft(key);
    }
  }, [key, version, value, isDirty]);

  const clear = useCallback(() => {
    if (key) {
      removeDraft(key);
    }
  }, [key]);

  return {
    isLoaded: loaded !== undefined,
    wasRestored: loaded?.restored ?? false,
    clear,
  };
}
