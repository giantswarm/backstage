/**
 * Dex encodes its ID token subject as a base64url protobuf:
 *   message IDTokenSubject { string user_id = 1; string conn_id = 2; }
 * e.g. "CgUzMjQ4OBIRZ2lhbnRzd2FybS1naXRodWI" → user 32488 via giantswarm-github.
 *
 * muster stamps this raw subject as the registered-by annotation, so the UI
 * receives it verbatim. Decode it into something human-readable; anything that
 * isn't such a subject (an email, a plain username) is returned as-is.
 */

const BASE64URL = /^[A-Za-z0-9_-]{8,}$/;

function decodeProto(bytes: Uint8Array): { userId: string; connId: string } {
  const fields: Record<number, string> = {};
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i];
    // ponytail: only wire type 2 (length-delimited) fields 1 and 2 exist in
    // dex's IDTokenSubject; anything else means this isn't one.
    if (tag !== 0x0a && tag !== 0x12) {
      throw new Error('not a dex subject');
    }
    i += 1;
    // varint length
    let len = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[i];
      if (b === undefined) throw new Error('truncated');
      i += 1;
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    if (i + len > bytes.length) throw new Error('truncated');
    fields[tag >> 3] = decoder.decode(bytes.subarray(i, i + len));
    i += len;
  }
  if (!fields[1] || !fields[2]) throw new Error('missing fields');
  return { userId: fields[1], connId: fields[2] };
}

/**
 * Decode a dex protobuf subject into a readable label, or return undefined if
 * the value isn't one (already-readable identities pass through untouched by
 * the caller).
 */
export function decodeDexSubject(sub: string): string | undefined {
  if (!BASE64URL.test(sub)) {
    return undefined;
  }
  try {
    const b64 = sub.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const { userId, connId } = decodeProto(bytes);
    return `${connId} user ${userId}`;
  } catch {
    return undefined;
  }
}
