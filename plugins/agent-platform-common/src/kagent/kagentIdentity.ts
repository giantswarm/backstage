/**
 * The subjects kagent's `unsecure` auth mode resolves every caller to: it
 * ignores the forwarded token and answers as a shared built-in user, so
 * seeing one means kagent did not identify the person. The frontend's "is
 * this list mine" probe and the backend's per-user model cost both refuse to
 * treat it as anyone.
 */
export const KAGENT_SHARED_SUBJECTS: readonly string[] = ['admin@kagent.dev'];
