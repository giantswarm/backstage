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

function writeDraft(key: string, serialized: string): void {
  try {
    window.sessionStorage.setItem(key, serialized);
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

/**
 * Removes every draft but `person`'s: one left by whoever used this tab
 * before (a sign-out does not clear the tab's storage) is not theirs to read.
 */
function removeOthersDrafts(person: string): void {
  try {
    Object.keys(window.sessionStorage)
      .filter(
        key => key.startsWith(`${KEY_PREFIX}:`) && !key.endsWith(`:${person}`),
      )
      .forEach(key => window.sessionStorage.removeItem(key));
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
   * compared serialized, so an inline object is fine: storage is written only
   * when the content changes while {@link isDirty}.
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
  /**
   * A stored draft was found and handed to `onRestore`, and neither `clear`
   * nor `dismissRestored` has run since: while true, show
   * `DraftRestoredAlert`.
   */
  wasRestored: boolean;
  /** The person closed the note about the restored draft; the draft stays. */
  dismissRestored: () => void;
  /**
   * Removes the stored draft (after a successful submit, or a discard) and
   * ends `wasRestored`. The value as it is now is not stored again; its next
   * change is, as new work.
   */
  clear: () => void;
};

type Loaded = {
  /** The `name` and `version` it was loaded for (see `draftTag`). */
  tag: string;
  key: string | undefined;
  restored: boolean;
};

const draftTag = (name: string, version: number) => `${name}@${version}`;

/**
 * Keeps a form's draft in the tab's `sessionStorage`, per person, and hands
 * it back when the form mounts again: after a reload, a sign-in redirect, the
 * browser's Back, or a link followed in the same tab. `sessionStorage` is the
 * tab's own, so two tabs never share a draft, and it goes with the tab; the
 * person's entity ref in the key keeps two people on one browser apart, and a
 * draft of anyone else's is removed when one loads.
 *
 * The form owns its state and passes it in; this hook stores and restores it
 * and says whether it restored one. It does not tell the person: show
 * `DraftRestoredAlert` while `wasRestored`, its close calling
 * `dismissRestored` and its Start over calling `clear` (and emptying the
 * form).
 */
export function useSessionDraft<T>({
  name,
  value,
  isDirty,
  version = 1,
  onRestore,
}: UseSessionDraftOptions<T>): SessionDraft {
  const identityApi = useApi(identityApiRef);
  const [loaded, setLoaded] = useState<Loaded>();
  const [isRestoredShown, setRestoredShown] = useState(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const tag = name ? draftTag(name, version) : undefined;

  useEffect(() => {
    if (!name || !tag) {
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
        let key: string | undefined;
        let stored: unknown;
        if (userEntityRef) {
          removeOthersDrafts(userEntityRef);
          key = sessionDraftStorageKey(name, userEntityRef);
          stored = readDraft(key, version);
        }
        if (stored !== undefined) {
          onRestoreRef.current(stored as T);
        }
        setLoaded({ tag, key, restored: stored !== undefined });
        setRestoredShown(stored !== undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [identityApi, name, version, tag]);

  // Only what was loaded for this name and version: after a change of either,
  // the old key is neither written nor counted as loaded.
  const current = tag && loaded?.tag === tag ? loaded : undefined;
  const key = current?.key;
  const serialized = isDirty ? JSON.stringify({ version, value }) : '';
  // What storage holds for `key` as far as this hook knows, so an unchanged
  // value is not written again: not on every render, and not after `clear`.
  const lastWritten = useRef<{ key: string; serialized: string }>();
  const serializedRef = useRef(serialized);
  serializedRef.current = serialized;

  // Not before the stored draft is read: the form's first, empty value would
  // remove it.
  useEffect(() => {
    if (!key) {
      return;
    }
    const last = lastWritten.current;
    if (last?.key === key && last.serialized === serialized) {
      return;
    }
    lastWritten.current = { key, serialized };
    if (serialized) {
      writeDraft(key, serialized);
    } else {
      removeDraft(key);
    }
  }, [key, serialized]);

  const clear = useCallback(() => {
    if (key) {
      removeDraft(key);
      // The value as it is now counts as handled; its next change is stored.
      lastWritten.current = { key, serialized: serializedRef.current };
    }
    setRestoredShown(false);
  }, [key]);
  const dismissRestored = useCallback(() => setRestoredShown(false), []);

  return {
    isLoaded: !name || current !== undefined,
    wasRestored: Boolean(current) && isRestoredShown,
    dismissRestored,
    clear,
  };
}
