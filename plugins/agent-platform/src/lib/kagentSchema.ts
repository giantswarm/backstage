import { z } from 'zod';

/**
 * Accepts anything and yields the value only when it is a non-empty string.
 *
 * Never fails, which is the whole point of this layer: kagent ships no OpenAPI
 * spec, so these schemas are the only contract we have and they must be
 * maximally forgiving — one renamed or retyped field must not drop a whole row.
 */
const wireString = z
  .unknown()
  .transform(value =>
    typeof value === 'string' && value !== '' ? value : undefined,
  )
  // Explicitly optional: wrapping `z.unknown()` in a transform makes the field
  // required again, which would fail every row that simply omits a key — and
  // real kagent responses omit most of them (`deleted_at`, `source`, `name` and
  // `agent_id` are nil pointers with `omitempty`).
  .optional();

/**
 * Wire shape of a kagent Session.
 *
 * `looseObject` so unknown fields pass through untouched (v0.10's
 * `share_token`/`share_read_only`, and whatever a future release adds), and
 * every field is permissive so absence or a type change degrades to `undefined`
 * rather than failing the parse.
 *
 * The Go struct is byte-identical between kagent v0.9.9 and v0.10 (see
 * `go/api/database/models.go`). Note that in practice most of these are absent:
 * `name`, `deleted_at`, `agent_id` and `source` are nil pointers with
 * `omitempty`, and live v0.9.9 responses carry no `source` at all.
 */
export const kagentSessionWireSchema = z.looseObject({
  id: wireString,
  name: wireString,
  user_id: wireString,
  created_at: wireString,
  updated_at: wireString,
  deleted_at: wireString,
  agent_id: wireString,
  // Deliberately not a z.enum: an unknown future `source` value must neither
  // fail the row nor be silently coerced into 'agent' (which we filter out).
  source: wireString,
});

export type KagentSessionWire = z.infer<typeof kagentSessionWireSchema>;

/**
 * kagent's `{ error, data, message }` envelope, tolerating three shapes:
 *
 * - `data` present            → the sessions
 * - `data` absent or null     → an empty result. Go's `omitempty` drops a
 *                               zero-length slice entirely, so there is no
 *                               empty array on the wire.
 * - a bare top-level array    → hypothetical future drift
 *
 * A `data` that is present but not an array is caught to `undefined` and
 * reported as drift by the caller rather than failing the page.
 */
export const kagentSessionListSchema = z.union([
  z
    .looseObject({
      error: z.unknown().optional(),
      message: z.unknown().optional(),
      // Deliberately `unknown[]`, not `kagentSessionWireSchema[]`: elements are
      // validated one at a time by the caller so a single malformed row (a
      // `null`, a retyped field) is skipped rather than failing the whole list.
      data: z.array(z.unknown()).nullish().catch(undefined),
    })
    .transform(envelope => ({
      rows: envelope.data ?? [],
      hadDataArray: envelope.data !== undefined && envelope.data !== null,
      isError: envelope.error === true,
      message:
        typeof envelope.message === 'string' ? envelope.message : undefined,
    })),
  z.array(z.unknown()).transform(rows => ({
    rows,
    hadDataArray: true,
    isError: false,
    message: undefined,
  })),
]);

/** kagent `GET /version`. */
export const kagentVersionWireSchema = z.looseObject({
  kagent_version: wireString,
  git_commit: wireString,
  build_date: wireString,
});

/**
 * kagent `GET /api/me`.
 *
 * Under `trusted-proxy` this reflects the forwarded token's claims; under
 * `unsecure` kagent ignores the token entirely and reports a shared default
 * user, which is what makes this probe worth having.
 */
export const kagentMeWireSchema = z.looseObject({
  sub: wireString,
});
