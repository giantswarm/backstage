import { z } from 'zod';

/**
 * Wire schemas for kagent's A2A task payloads — `GET /api/sessions/:id/tasks`
 * and the session-plus-events envelope of `GET /api/sessions/:id`.
 *
 * Same philosophy as `kagentSchema.ts`: kagent ships no OpenAPI spec and the
 * fleet can run mixed versions, so every field is permissive and unknown fields
 * pass through. A drifted or malformed message must cost us that message, never
 * the page.
 *
 * The shapes here are the **legacy A2A v0 wire** (a2a 0.3), which is what kagent
 * answers with when no `A2A-Version` header is sent — see the backend client for
 * why we deliberately don't send one.
 */

/** Accepts anything, yields the value only when it is a non-empty string. */
const wireString = z
  .unknown()
  .transform(value =>
    typeof value === 'string' && value !== '' ? value : undefined,
  )
  // Wrapping z.unknown() in a transform makes the field required again, which
  // would fail every object that simply omits the key.
  .optional();

/**
 * One part of a message.
 *
 * `kind` discriminates in principle (`text` | `file` | `data`), but it is left as
 * a permissive string: classification happens on the *content* plus the part's
 * metadata, so a renamed or missing `kind` degrades to "not a part we recognise"
 * rather than failing.
 */
export const a2aPartWireSchema = z.looseObject({
  kind: wireString,
  text: wireString,
  data: z.unknown().optional(),
  file: z.unknown().optional(),
  metadata: z.unknown().optional(),
});

export type A2aPartWire = z.infer<typeof a2aPartWireSchema>;

/**
 * One message in a task's history.
 *
 * Note there is **no timestamp**: A2A messages carry none. Per-item times come
 * from joining `messageId` against the session's events — see
 * `kagentEventTimestamps.ts`.
 */
export const a2aMessageWireSchema = z.looseObject({
  kind: wireString,
  messageId: wireString,
  role: wireString,
  // Individually validated by the caller, so one malformed part is skipped
  // rather than dropping the message it belongs to.
  parts: z.array(z.unknown()).nullish().catch(undefined),
  metadata: z.unknown().optional(),
  taskId: wireString,
  contextId: wireString,
});

export type A2aMessageWire = z.infer<typeof a2aMessageWireSchema>;

/**
 * A task's status.
 *
 * `state` is deliberately not a `z.enum`: a future A2A state must render as
 * itself rather than failing the parse or being coerced into a state we do
 * recognise. `message` carries the pending prompt while a task waits for input.
 */
export const a2aTaskStatusWireSchema = z.looseObject({
  state: wireString,
  timestamp: wireString,
  message: z.unknown().optional(),
});

/** One A2A task — a single turn of the session. */
export const a2aTaskWireSchema = z.looseObject({
  id: wireString,
  contextId: wireString,
  kind: wireString,
  status: a2aTaskStatusWireSchema.nullish().catch(undefined),
  history: z.array(z.unknown()).nullish().catch(undefined),
  artifacts: z.array(z.unknown()).nullish().catch(undefined),
  metadata: z.unknown().optional(),
});

export type A2aTaskWire = z.infer<typeof a2aTaskWireSchema>;

/**
 * One event of an A2A `message/stream` turn, as relayed by the backend's
 * streaming route.
 *
 * The legacy v0 wire multiplexes four shapes over one field set, discriminated
 * by `kind`: a `task` snapshot, a `status-update` (whose `status.message`
 * carries the agent's output), an `artifact-update` (whose `artifact.parts`
 * carry streamed response chunks), and a bare `message`. One permissive schema
 * rather than a union, for the same reason as `kagentSessionDetailSchema`: with
 * every field optional the members are indistinguishable, and a union would
 * silently resolve everything to its first branch. `kind` is read after
 * parsing.
 *
 * As permissive as its siblings, and for a stronger reason than usual: these
 * events are consumed *live*, so a shape we cannot read must cost us that
 * event — the poll delivers the canonical history regardless — never the
 * stream.
 */
export const a2aStreamEventWireSchema = z.looseObject({
  kind: wireString,
  // `task` events name themselves `id`; the update events say `taskId`.
  id: wireString,
  taskId: wireString,
  contextId: wireString,
  status: a2aTaskStatusWireSchema.nullish().catch(undefined),
  // On a `status-update`, whether this is the turn's terminal event.
  final: z.boolean().nullish().catch(undefined),
  // `artifact-update` only.
  artifact: z
    .looseObject({
      artifactId: wireString,
      parts: z.array(z.unknown()).nullish().catch(undefined),
      metadata: z.unknown().optional(),
    })
    .nullish()
    .catch(undefined),
  lastChunk: z.boolean().nullish().catch(undefined),
  // A bare `message` event is the message schema's own shape; these fields
  // cover the parts of it this stream consumer reads.
  messageId: wireString,
  role: wireString,
  parts: z.array(z.unknown()).nullish().catch(undefined),
  metadata: z.unknown().optional(),
});

export type A2aStreamEventWire = z.infer<typeof a2aStreamEventWireSchema>;

/**
 * kagent's `{ error, data, message }` envelope around a list.
 *
 * Tolerates the three shapes the sessions list already taught us to expect:
 * `data` present, `data` absent or null (Go's `omitempty` drops a zero-length
 * slice, so there is no empty array on the wire), and a bare top-level array.
 *
 * A `data` that is present but not an array is caught to `undefined`, which the
 * caller reports as drift rather than failing the page.
 */
function listEnvelopeSchema() {
  return z.union([
    z
      .looseObject({
        error: z.unknown().optional(),
        message: z.unknown().optional(),
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
}

/** `GET /api/sessions/:id/tasks`. */
export const kagentTaskListSchema = listEnvelopeSchema();

/**
 * The `data` payload of `GET /api/sessions/:id`.
 *
 * `read_only` only exists from kagent v0.10 (`ReadOnly *bool`, added after
 * v0.9.9), hence optional. It is unused while the detail page is read-only, but
 * parsed so a later share-link feature has it.
 */
const sessionDetailPayloadSchema = z.looseObject({
  session: z.unknown().optional(),
  read_only: z.boolean().nullish().catch(undefined),
  // `events` is not declared: `looseObject` lets it pass through untouched, and
  // nothing reads it. See KagentSessionDetail for why it is not the per-message
  // timestamp source it looked like.
});

/**
 * `GET /api/sessions/:id`, tolerating both the enveloped form and a bare
 * `{ session, … }` object in case a future version drops the envelope.
 *
 * Deliberately **one** schema rather than a `z.union` of the two shapes: with
 * every field optional, an enveloped body also satisfies the bare shape and vice
 * versa, so a union would always resolve to whichever member came first and the
 * other form would silently parse to an empty payload. Reading both off the same
 * object and preferring `data` has no such ambiguity.
 */
export const kagentSessionDetailSchema = z
  .looseObject({
    error: z.unknown().optional(),
    message: z.unknown().optional(),
    data: sessionDetailPayloadSchema.nullish().catch(undefined),
    // The same fields again, for the un-enveloped form.
    session: z.unknown().optional(),
    read_only: z.boolean().nullish().catch(undefined),
  })
  .transform(body => ({
    payload:
      body.data ??
      (body.session === undefined
        ? undefined
        : { session: body.session, read_only: body.read_only }),
    isError: body.error === true,
    message: typeof body.message === 'string' ? body.message : undefined,
  }));

// There is deliberately no schema for a stored event.
//
// kagent's Go type says `Data string // JSON-serialized protocol.Message`, which
// suggested events could supply the per-message timestamps A2A messages lack. A
// real gazelle payload disproved it: the decoded value is an **ADK event**
// (`author`, `content`, `invocation_id`, `partial`, `timestamp`, `usage_metadata`,
// …) with no `messageId` at all, so there is nothing to join task history against.
//
// If a future feature wants a finer timeline than one timestamp per turn, events
// are the place to get it — but that means parsing ADK `Content` (whose function
// calls are shaped differently from A2A data parts), not reusing anything here.
