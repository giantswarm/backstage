import {
  isRuntimeLostFailureText,
  isRuntimeLostReason,
  readConversationRuntimeLoss,
  readReportedRuntimeLoss,
  readRuntimeLoss,
  readRuntimeLostTurn,
} from './kagentRuntimeLost';
import {
  normalizeSessionDetail,
  normalizeTaskList,
} from './kagentSessionDetail';
import {
  agentInstanceRuntimeLost,
  tasksAskUserPending,
  tasksFailed,
  tasksRuntimeLost,
  tasksV099,
} from '../testFixtures';

const ATENET =
  'actor "ai-01a09e86-0da0-764b-87b1-ac52875d1e74" request timed out';

describe('isRuntimeLostFailureText', () => {
  it.each([
    ['atenet, after its resume budget', ATENET],
    [
      'the A2A gateway, when the runtime cannot be dialled',
      'failed to connect to AgentInstance runtime: rpc error: code = Unavailable',
    ],
    [
      'the scheduler reporting the locality miss as capacity',
      'workflow failed at step AssignWorker: rpc error: code = ResourceExhausted desc = no free workers available',
    ],
    ['kagent, once it names the cause', 'runtime lost: local snapshot gone'],
    [
      'kagent, wrapped by the backend',
      "The agent on installation 'gazelle' did not accept the message: runtime lost: node gone",
    ],
    [
      'Substrate, once it names the node',
      'local snapshot 586930a4 on node ip-10-0-159-226 is gone',
    ],
    [
      'atenet naming the resume',
      'substrate ResumeActor failed: ResumeActor timed out after 30s',
    ],
  ])('reads %s as a lost runtime', (_layer, text) => {
    expect(isRuntimeLostFailureText(text)).toBe(true);
  });

  it.each([
    [
      'a model the provider refuses',
      'OpenAI chat completion request failed: 404 model_not_found',
    ],
    [
      'a tool refusal',
      'tool "filter_tools" requires confirmation, please approve or reject',
    ],
    [
      "the gateway's one-active-task refusal",
      'instance already has an active task',
    ],
    ['a plain timeout with no actor named', 'request timed out'],
    ['nothing', undefined],
    ['an empty string', ''],
  ])("keeps %s as the turn's own failure", (_what, text) => {
    expect(isRuntimeLostFailureText(text)).toBe(false);
  });
});

describe('isRuntimeLostReason', () => {
  it.each(['RUNTIME_LOST', 'RuntimeLost', 'runtime-lost', 'runtime lost'])(
    'accepts %s',
    reason => {
      expect(isRuntimeLostReason(reason)).toBe(true);
    },
  );

  it.each(['no ready revision', 'RUNTIME_UNAVAILABLE', '', undefined])(
    'refuses %s',
    reason => {
      expect(isRuntimeLostReason(reason)).toBe(false);
    },
  );
});

describe('readRuntimeLostTurn', () => {
  const tasks = normalizeTaskList(tasksRuntimeLost).tasks;

  it("reads a failed turn carrying the runtime's words", () => {
    expect(readRuntimeLostTurn(tasks[1])).toEqual({ cause: ATENET });
  });

  it('reads nothing off a completed turn', () => {
    expect(readRuntimeLostTurn(tasks[0])).toBeUndefined();
  });

  it("reads nothing off a turn that failed for the agent's own reasons", () => {
    const [modelRefused] = normalizeTaskList(tasksFailed).tasks;
    expect(readRuntimeLostTurn(modelRefused)).toBeUndefined();
  });
});

describe('readConversationRuntimeLoss', () => {
  it('counts the consecutive failed attempts from the newest turn back', () => {
    const tasks = normalizeTaskList(tasksRuntimeLost).tasks;

    expect(readConversationRuntimeLoss(tasks)).toEqual({
      reported: false,
      cause: ATENET,
      attempts: 2,
    });
  });

  it('is one attempt after the first failure', () => {
    const tasks = normalizeTaskList(tasksRuntimeLost).tasks.slice(0, 2);

    expect(readConversationRuntimeLoss(tasks)).toEqual(
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('is nothing once a later turn did anything else', () => {
    // The runtime evidently came back: whatever happened before is history.
    const tasks = normalizeTaskList(tasksRuntimeLost).tasks;
    const recovered = [
      ...tasks,
      {
        ...tasks[0],
        id: 'task-4',
        status: { state: 'working', timestamp: '2026-09-15T09:00:00.000Z' },
      },
    ];

    expect(readConversationRuntimeLoss(recovered)).toBeUndefined();
  });

  it('skips a trailing task that reports no state', () => {
    const tasks = normalizeTaskList(tasksRuntimeLost).tasks;
    const withStateless = [...tasks, { ...tasks[0], id: 'task-4', status: {} }];

    expect(readConversationRuntimeLoss(withStateless)).toEqual(
      expect.objectContaining({ attempts: 2 }),
    );
  });

  it.each([
    ['a healthy conversation', tasksV099],
    ['a session waiting for an answer', tasksAskUserPending],
    ["a turn that failed for the agent's own reasons", tasksFailed],
  ])('reads nothing off %s', (_what, fixture) => {
    expect(
      readConversationRuntimeLoss(normalizeTaskList(fixture).tasks),
    ).toBeUndefined();
  });

  it('reads nothing off no conversation at all', () => {
    expect(readConversationRuntimeLoss([])).toBeUndefined();
  });
});

describe('readReportedRuntimeLoss', () => {
  const session = normalizeSessionDetail(agentInstanceRuntimeLost, 'gazelle')
    .detail!.session;

  it("reads kagent's mark off the instance, dropping its own prefix from the cause", () => {
    expect(readReportedRuntimeLoss(session)).toEqual({
      reported: true,
      cause:
        'local snapshot 586930a4-7261-4ced-b30a-3959f392b2ca on node ip-10-0-159-226.eu-central-1.compute.internal is gone',
      attempts: 0,
    });
  });

  it('reads nothing off an instance without the mark', () => {
    expect(readReportedRuntimeLoss({})).toBeUndefined();
    expect(
      readReportedRuntimeLoss({ failure: { reason: 'no ready revision' } }),
    ).toBeUndefined();
  });

  it('reads a mark with no message as a loss with no cause', () => {
    expect(
      readReportedRuntimeLoss({ failure: { reason: 'RUNTIME_LOST' } }),
    ).toEqual({ reported: true, cause: undefined, attempts: 0 });
  });
});

describe('readRuntimeLoss', () => {
  const reported = normalizeSessionDetail(agentInstanceRuntimeLost, 'gazelle')
    .detail!.session;
  const tasks = normalizeTaskList(tasksRuntimeLost).tasks;

  it("lets the instance's mark win and folds the conversation's attempts in", () => {
    expect(readRuntimeLoss(reported, tasks)).toEqual({
      reported: true,
      cause: expect.stringContaining('is gone'),
      attempts: 2,
    });
  });

  it("falls back to the conversation's own reading without a mark", () => {
    expect(readRuntimeLoss({}, tasks)).toEqual({
      reported: false,
      cause: ATENET,
      attempts: 2,
    });
  });

  it("takes the conversation's cause when the mark names none", () => {
    expect(
      readRuntimeLoss({ failure: { reason: 'RUNTIME_LOST' } }, tasks),
    ).toEqual(expect.objectContaining({ reported: true, cause: ATENET }));
  });

  it('reads a reported loss before any turn failed', () => {
    expect(readRuntimeLoss(reported, [])).toEqual(
      expect.objectContaining({ reported: true, attempts: 0 }),
    );
  });

  it('reads nothing off a healthy session', () => {
    expect(
      readRuntimeLoss({}, normalizeTaskList(tasksV099).tasks),
    ).toBeUndefined();
    expect(readRuntimeLoss(undefined, undefined)).toBeUndefined();
  });
});
