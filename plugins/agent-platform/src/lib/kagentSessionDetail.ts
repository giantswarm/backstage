import {
  a2aTaskWireSchema,
  A2aTaskWire,
  kagentSessionDetailSchema,
  kagentTaskListSchema,
} from './kagentTaskSchema';
import {
  KagentSession,
  normalizeSession,
  parseSessionWire,
  SessionListDrift,
} from './kagentSessions';

/**
 * One session's metadata, from `GET /api/sessions/:id`.
 *
 * Only `session` is read. The response's `events` array is deliberately ignored:
 * despite what kagent's Go type claims (`Data string // JSON-serialized
 * protocol.Message`), a stored event is **not** an A2A message — a real gazelle
 * payload holds an ADK event (`author`, `content`, `invocation_id`, `partial`,
 * `timestamp`, …) with no `messageId` anywhere. So events cannot be correlated
 * with the task history that makes up the timeline, and they carry no state.
 *
 * They are also enormous: in that same payload the events were 591 KB against
 * 261 bytes of session metadata, which is why the request asks kagent for as few
 * of them as it will give us.
 */
export type KagentSessionDetail = {
  session: KagentSession;
  /** v0.10+ only; undefined on v0.9.9. Unused while the page is read-only. */
  readOnly?: boolean;
};

export type NormalizedSessionDetail = {
  detail?: KagentSessionDetail;
  drift?: SessionListDrift;
};

/**
 * Parse a raw `GET /api/sessions/:id` body.
 *
 * Never throws. `detail` is absent only when the body carried no usable session
 * at all, which callers treat as "not found" rather than as an error — the
 * backend already turns a genuine 404 into one.
 */
export function normalizeSessionDetail(
  raw: unknown,
  installation: string,
): NormalizedSessionDetail {
  const parsed = kagentSessionDetailSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      drift: { kind: 'unparseable-body', message: 'unparseable response body' },
    };
  }

  // kagent can report a failure in-band on a 200 — the backend classifies on HTTP
  // status alone and passes any 2xx body through verbatim, so the envelope's
  // `error` flag is ours to check.
  if (parsed.data.isError) {
    return {
      drift: {
        kind: 'error-envelope',
        message:
          parsed.data.message ?? 'kagent reported an error in the envelope',
      },
    };
  }

  const payload = parsed.data.payload;
  const wire = parseSessionWire(payload?.session);
  if (!wire?.id) {
    // No id means nothing downstream works: it keys the row and identifies the
    // session. Reported as drift so it is visible, but treated as "no session".
    return {
      drift: {
        kind: 'skipped-rows',
        message: 'the response carried no readable session',
      },
    };
  }

  return {
    detail: {
      session: normalizeSession(wire, installation),
      readOnly: payload?.read_only ?? undefined,
    },
  };
}

export type NormalizedTaskList = {
  tasks: A2aTaskWire[];
  drift?: SessionListDrift;
};

/**
 * Parse a raw `GET /api/sessions/:id/tasks` body.
 *
 * Tasks are kept in wire form rather than mapped to a domain type: the only
 * consumer is `buildTimeline`, which needs the full nested structure, so an
 * intermediate shape would be a second thing to keep in sync for no gain.
 *
 * Order is preserved — kagent returns tasks `ORDER BY created_at ASC`, and the
 * timeline and the session's state both depend on that being chronological.
 */
export function normalizeTaskList(raw: unknown): NormalizedTaskList {
  const parsed = kagentTaskListSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      tasks: [],
      drift: { kind: 'unparseable-body', message: 'unparseable response body' },
    };
  }

  if (parsed.data.isError) {
    return {
      tasks: [],
      drift: {
        kind: 'error-envelope',
        message:
          parsed.data.message ?? 'kagent reported an error in the envelope',
      },
    };
  }

  // Row by row, so one malformed task costs that turn rather than the page.
  const tasks: A2aTaskWire[] = [];
  let skippedRows = 0;
  for (const row of parsed.data.rows) {
    const task = a2aTaskWireSchema.safeParse(row);
    if (!task.success) {
      skippedRows += 1;
      continue;
    }
    tasks.push(task.data);
  }

  // `data` legitimately absent means "no tasks yet" (Go's `omitempty` drops an
  // empty slice). `data` present but not an array means the contract moved.
  const dataValue =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as { data?: unknown }).data
      : undefined;
  const hadDataKey = dataValue !== null && dataValue !== undefined;

  if (hadDataKey && !parsed.data.hadDataArray) {
    return {
      tasks,
      drift: {
        kind: 'data-not-array',
        message: 'data was present but not an array',
      },
    };
  }

  if (skippedRows > 0) {
    return {
      tasks,
      drift: {
        kind: 'skipped-rows',
        message: `skipped ${skippedRows} unreadable task ${
          skippedRows === 1 ? 'row' : 'rows'
        }`,
      },
    };
  }

  return { tasks };
}
