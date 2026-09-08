import {
  normalizeTaskList,
  reduceSessionUsage,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  tasksAdkPrefixed,
  tasksApproval,
  tasksAskUser,
  tasksAskUserPending,
  tasksFailed,
  tasksUnknownState,
  tasksV099,
} from '@giantswarm/backstage-plugin-agent-platform-common/testFixtures';
import { buildTimeline } from './kagentTimeline';

/**
 * The Usage page's totals and the session detail page's stats strip must agree.
 *
 * They are computed by two different functions — `reduceSessionUsage` on the
 * backend, over every session at once, and `buildTimeline` here, over the one
 * session on screen — because one builds render items and the other builds
 * counters. That is a deliberate duplication of *arithmetic*, and this is what
 * stops the two drifting: every rule they share is exercised on the same
 * fixtures, and a change to either that alters a sum fails here rather than
 * showing a user two different numbers for one session.
 *
 * Lives in this plugin rather than in the common package because only this side
 * can import `buildTimeline`.
 */
const WIDE = {
  startMs: Date.parse('2020-01-01T00:00:00Z'),
  endMs: Date.parse('2030-01-01T00:00:00Z'),
};

const FIXTURES: Array<[string, unknown]> = [
  ['a v0.9.9 session with a delegation', tasksV099],
  ['an adk_-prefixed session', tasksAdkPrefixed],
  ['a session with an approval', tasksApproval],
  ['a session with an answered question', tasksAskUser],
  ['a session waiting on a question', tasksAskUserPending],
  ['a session whose turn failed', tasksFailed],
  ['a session in an unknown state', tasksUnknownState],
];

describe.each(FIXTURES)('token sums agree on %s', (_name, fixture) => {
  const { tasks } = normalizeTaskList(fixture);

  it('input and output match the timeline', () => {
    const timeline = buildTimeline(tasks);
    const usage = reduceSessionUsage(tasks, WIDE);

    expect({
      prompt: usage.tally.inputTokens,
      completion: usage.tally.outputTokens,
      total: usage.tally.totalTokens,
    }).toEqual(timeline.tokens);
  });

  it('the turn count matches the task count', () => {
    // The timeline groups items by `taskIndex`; the reducer counts tasks. Both
    // mean "turns", and the stats strip renders the task count directly.
    const usage = reduceSessionUsage(tasks, WIDE);

    expect(usage.tally.turns).toBe(tasks.length);
  });
});
