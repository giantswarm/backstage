import { useCallback, useEffect, useRef, useState } from 'react';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import useCopyToClipboard from 'react-use/esm/useCopyToClipboard';

const COPIED_DURATION_MS = 1500;

/**
 * Copies text to the clipboard and reports `copied` for a moment afterwards,
 * so the control can confirm with "Copied".
 *
 * A failure goes to the error API, the same way Backstage's CopyTextButton
 * reports it, and `copied` stays false.
 */
export function useCopyWithFeedback(): {
  copied: boolean;
  copy: (text: string) => void;
  /** Ends the "Copied" moment early, e.g. when its dialog closes. */
  reset: () => void;
} {
  const errorApi = useApi(errorApiRef);
  const [copied, setCopied] = useState(false);
  const [{ error }, copyToClipboard] = useCopyToClipboard();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (error) {
      errorApi.post(error);
    }
  }, [error, errorApi]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setCopied(false);
  }, []);

  const copy = useCallback(
    (text: string) => {
      copyToClipboard(text);
      setCopied(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(
        () => setCopied(false),
        COPIED_DURATION_MS,
      );
    },
    [copyToClipboard],
  );

  return { copied: copied && !error, copy, reset };
}
