/**
 * kagent wire fixtures, shared with the plugins' own tests.
 *
 * The version-matrix fixtures live beside the parsers they exercise, but the
 * frontend's tests need the same payloads to drive components — and a test
 * asserting against a *different* copy of a v0.9.9 response is one that can pass
 * while the real one breaks. So they are shared through this entry point rather
 * than duplicated, and rather than deep-imported out of `src`, which the
 * `no-forbidden-package-imports` lint rule rejects.
 *
 * Every fixture carries an explicit type rather than the one inferred from its
 * JSON. That is not cosmetic: the package's type rollup cannot resolve a `.json`
 * module, so a declaration referring to one fails the build.
 *
 * Test-only. Nothing in a shipped code path should import this.
 */

/**
 * A well-formed task envelope, typed loosely enough to be *mutated*.
 *
 * Tests routinely clone a fixture and move a state or drop a message to reach a
 * case no captured response covers. The real parse types (`A2aTaskWire`) are
 * deliberately permissive about absence, which makes them awkward to write
 * through, so this mirrors the fixtures' actual shape instead — and only the
 * fixtures that genuinely have it. The malformed and envelope-tolerance ones are
 * `unknown`, which is what a parser sees anyway.
 */
export type TaskEnvelopeFixture = {
  error?: boolean;
  message?: string;
  data: TaskFixture[];
};

export type TaskFixture = {
  id?: string;
  contextId?: string;
  status: {
    state?: string;
    timestamp?: string;
    message?: unknown;
  };
  history: MessageFixture[];
};

export type MessageFixture = {
  messageId?: string;
  role?: string;
  taskId?: string;
  contextId?: string;
  parts?: unknown[];
};

import sessionDetailBareJson from './kagent/__fixtures__/session-detail.bare.json';
import sessionDetailNoEventsJson from './kagent/__fixtures__/session-detail.no-events.json';
import sessionDetailNoSessionJson from './kagent/__fixtures__/session-detail.no-session.json';
import sessionDetailV010Json from './kagent/__fixtures__/session-detail.v0-10.json';
import sessionDetailV099Json from './kagent/__fixtures__/session-detail.v0-9-9.json';
import sessionsBareArrayJson from './kagent/__fixtures__/sessions.bare-array.json';
import sessionsDataNotArrayJson from './kagent/__fixtures__/sessions.data-not-array.json';
import sessionsDataNullJson from './kagent/__fixtures__/sessions.data-null.json';
import sessionsEmptyNoDataJson from './kagent/__fixtures__/sessions.empty-no-data.json';
import sessionsErrorEnvelopeJson from './kagent/__fixtures__/sessions.error-envelope.json';
import sessionsFutureUnknownSourceJson from './kagent/__fixtures__/sessions.future-unknown-source.json';
import sessionsFutureV011Json from './kagent/__fixtures__/sessions.future-v0-11.json';
import sessionsMalformedJson from './kagent/__fixtures__/sessions.malformed.json';
import sessionsRealV099Json from './kagent/__fixtures__/sessions.real-v0-9-9.json';
import sessionsV010Json from './kagent/__fixtures__/sessions.v0-10.json';
import sessionsV099Json from './kagent/__fixtures__/sessions.v0-9-9.json';
import sessionsZeroTimeJson from './kagent/__fixtures__/sessions.zero-time.json';
import tasksAdkPrefixedJson from './kagent/__fixtures__/tasks.adk-prefixed.json';
import tasksApprovalJson from './kagent/__fixtures__/tasks.approval.json';
import tasksAskUserPendingJson from './kagent/__fixtures__/tasks.ask-user-pending.json';
import tasksAskUserJson from './kagent/__fixtures__/tasks.ask-user.json';
import tasksBareArrayJson from './kagent/__fixtures__/tasks.bare-array.json';
import tasksDataNotArrayJson from './kagent/__fixtures__/tasks.data-not-array.json';
import tasksEmptyNoDataJson from './kagent/__fixtures__/tasks.empty-no-data.json';
import tasksErrorEnvelopeJson from './kagent/__fixtures__/tasks.error-envelope.json';
import tasksFailedJson from './kagent/__fixtures__/tasks.failed.json';
import tasksMalformedJson from './kagent/__fixtures__/tasks.malformed.json';
import tasksUnknownStateJson from './kagent/__fixtures__/tasks.unknown-state.json';
import tasksV099Json from './kagent/__fixtures__/tasks.v0-9-9.json';

export const sessionDetailBare: unknown = sessionDetailBareJson as unknown;
export const sessionDetailNoEvents: unknown =
  sessionDetailNoEventsJson as unknown;
export const sessionDetailNoSession: unknown =
  sessionDetailNoSessionJson as unknown;
export const sessionDetailV010: unknown = sessionDetailV010Json as unknown;
export const sessionDetailV099: unknown = sessionDetailV099Json as unknown;
export const sessionsBareArray: unknown = sessionsBareArrayJson as unknown;
export const sessionsDataNotArray: unknown =
  sessionsDataNotArrayJson as unknown;
export const sessionsDataNull: unknown = sessionsDataNullJson as unknown;
export const sessionsEmptyNoData: unknown = sessionsEmptyNoDataJson as unknown;
export const sessionsErrorEnvelope: unknown =
  sessionsErrorEnvelopeJson as unknown;
export const sessionsFutureUnknownSource: unknown =
  sessionsFutureUnknownSourceJson as unknown;
export const sessionsFutureV011: unknown = sessionsFutureV011Json as unknown;
export const sessionsMalformed: unknown = sessionsMalformedJson as unknown;
export const sessionsRealV099: unknown = sessionsRealV099Json as unknown;
export const sessionsV010: unknown = sessionsV010Json as unknown;
export const sessionsV099: unknown = sessionsV099Json as unknown;
export const sessionsZeroTime: unknown = sessionsZeroTimeJson as unknown;
export const tasksAdkPrefixed: TaskEnvelopeFixture =
  tasksAdkPrefixedJson as TaskEnvelopeFixture;
export const tasksApproval: TaskEnvelopeFixture =
  tasksApprovalJson as TaskEnvelopeFixture;
export const tasksAskUserPending: TaskEnvelopeFixture =
  tasksAskUserPendingJson as TaskEnvelopeFixture;
export const tasksAskUser: TaskEnvelopeFixture =
  tasksAskUserJson as TaskEnvelopeFixture;
export const tasksBareArray: unknown = tasksBareArrayJson as unknown;
export const tasksDataNotArray: unknown = tasksDataNotArrayJson as unknown;
export const tasksEmptyNoData: unknown = tasksEmptyNoDataJson as unknown;
export const tasksErrorEnvelope: unknown = tasksErrorEnvelopeJson as unknown;
export const tasksFailed: TaskEnvelopeFixture =
  tasksFailedJson as TaskEnvelopeFixture;
export const tasksMalformed: unknown = tasksMalformedJson as unknown;
export const tasksUnknownState: TaskEnvelopeFixture =
  tasksUnknownStateJson as TaskEnvelopeFixture;
export const tasksV099: TaskEnvelopeFixture =
  tasksV099Json as TaskEnvelopeFixture;
