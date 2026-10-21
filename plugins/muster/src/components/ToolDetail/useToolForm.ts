import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { FormValue } from '../../lib/schemaForm';

/** localStorage key for a tool's last-used arguments, scoped per installation. */
function argsKey(installation: string | undefined, name: string): string {
  return `muster-tool-args:${installation ?? 'default'}/${name}`;
}

function loadStoredArgs(key: string): Record<string, FormValue> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, FormValue>) : {};
  } catch {
    return {};
  }
}

function storeArgs(key: string, values: Record<string, FormValue>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // localStorage may be unavailable (private mode); not fatal.
  }
}

/** What is typed into a tool's argument form. */
export type ToolForm = {
  values: Record<string, FormValue>;
  setValues: Dispatch<SetStateAction<Record<string, FormValue>>>;
  /** The list arguments edited as JSON rather than as rows. */
  jsonModes: Record<string, boolean>;
  setJsonModes: Dispatch<SetStateAction<Record<string, boolean>>>;
  /** Keeps the values as the tool's last-used arguments, on a run. */
  remember: () => void;
};

/**
 * A tool's argument form as typed so far, starting from its last-used
 * arguments on this installation, which a run remembers. The state lives
 * with the caller, so a page that keeps it above its tabs keeps what was
 * typed across a tab switch, as it keeps the run with {@link useToolRun}.
 * Another tool or installation starts from its own remembered arguments.
 */
export function useToolForm(
  name: string,
  installation: string | undefined,
): ToolForm {
  const storageKey = argsKey(installation, name);
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    loadStoredArgs(storageKey),
  );
  const [jsonModes, setJsonModes] = useState<Record<string, boolean>>({});

  // Only when the tool changes: on the first render the state is already its
  // remembered arguments, and reloading them then would drop a draft.
  const loadedKey = useRef(storageKey);
  useEffect(() => {
    if (loadedKey.current === storageKey) {
      return;
    }
    loadedKey.current = storageKey;
    setValues(loadStoredArgs(storageKey));
    setJsonModes({});
  }, [storageKey]);

  const remember = useCallback(
    () => storeArgs(storageKey, values),
    [storageKey, values],
  );

  return { values, setValues, jsonModes, setJsonModes, remember };
}
