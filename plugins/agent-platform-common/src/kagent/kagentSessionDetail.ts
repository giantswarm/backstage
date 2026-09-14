import {
  a2aV1TaskListWireSchema,
  isA2aV1TaskList,
  toWireTask,
} from './kagentA2aV1';
import {
  agentInstanceEnvelopeWireSchema,
  isAgentInstanceEnvelope,
  normalizeAgentInstance,
  parseAgentInstanceWire,
} from './kagentAgentInstance';
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
 * protocol.Message`), a stored event is **not** an A2A message — a real payload
 * from an internal installation holds an ADK event (`author`, `content`,
 * `invocation_id`, `partial`, `timestamp`, …) with no `messageId` anywhere. So
 * events cannot be correlated with the task history that makes up the timeline,
 * and they carry no state.
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
 * Parse a raw session detail: a `GetAgentInstanceResponse` (`{agentInstance}`,
 * the API v2 line) or a 0.10 `GET /api/sessions/:id` body.
 *
 * Never throws. `detail` is absent only when the body carried no usable session
 * at all, which callers treat as "not found" rather than as an error — the
 * backend already turns a genuine 404 into one.
 */
export function normalizeSessionDetail(
  raw: unknown,
  installation: string,
): NormalizedSessionDetail {
  if (isAgentInstanceEnvelope(raw)) {
    const envelope = agentInstanceEnvelopeWireSchema.safeParse(raw);
    const wire = envelope.success
      ? parseAgentInstanceWire(envelope.data.agentInstance)
      : undefined;
    if (!wire?.id) {
      return {
        drift: {
          kind: 'missing-payload',
          message: 'the response carried no readable AgentInstance',
        },
      };
    }
    // Instances carry no read-only flag: sharing an instance is a separate
    // grant the portal does not use, so its own sessions are never read-only.
    return { detail: { session: normalizeAgentInstance(wire, installation) } };
  }

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
        kind: 'missing-payload',
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
 * Parse a raw task list: an A2A v1 `ListTasksResponse` (`{tasks: […]}`, the
 * API v2 line) or a 0.10 `GET /api/sessions/:id/tasks` envelope.
 *
 * Tasks are kept in wire form rather than mapped to a domain type: the only
 * consumer is `buildTimeline`, which needs the full nested structure, so an
 * intermediate shape would be a second thing to keep in sync for no gain. A v1
 * task is translated into that wire form first (`toWireTask`), so there is one
 * form.
 *
 * Order is preserved — both controllers return tasks oldest first, and the
 * timeline and the session's state both depend on that being chronological.
 */
export function normalizeTaskList(raw: unknown): NormalizedTaskList {
  if (isA2aV1TaskList(raw)) {
    return normalizeA2aV1TaskList(raw);
  }

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

/**
 * The API v2 half of {@link normalizeTaskList}: each task translated then
 * validated one at a time, so one malformed turn costs itself rather than the
 * page. An absent `tasks` is an instance that has not run yet, never drift.
 */
function normalizeA2aV1TaskList(raw: unknown): NormalizedTaskList {
  const parsed = a2aV1TaskListWireSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      tasks: [],
      drift: { kind: 'unparseable-body', message: 'unparseable response body' },
    };
  }
  const tasks: A2aTaskWire[] = [];
  let skippedRows = 0;
  for (const row of parsed.data.tasks ?? []) {
    const translated = toWireTask(row);
    const task = translated
      ? a2aTaskWireSchema.safeParse(translated)
      : undefined;
    if (!task?.success) {
      skippedRows += 1;
      continue;
    }
    tasks.push(task.data);
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
