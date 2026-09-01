import { A2aTaskWire } from './kagentTaskSchema';
import { readPendingConfirmation } from './kagentHitl';

/** A confirmation request as kagent puts it on `status.message`. */
function confirmationPart(
  proposed: { name: string; args?: unknown },
  hint = 'Approve?',
) {
  return {
    kind: 'data',
    data: {
      name: 'adk_request_confirmation',
      id: 'adk-confirm-1',
      args: {
        originalFunctionCall: {
          name: proposed.name,
          args: proposed.args,
          id: 'call-1',
        },
        toolConfirmation: { confirmed: false, hint, payload: null },
      },
    },
    metadata: { adk_is_long_running: true, adk_type: 'function_call' },
  };
}

function task(
  id: string,
  state: string,
  statusMessageParts?: unknown[],
): A2aTaskWire {
  return {
    id,
    kind: 'task',
    status: {
      state,
      timestamp: '2026-08-31T15:31:51Z',
      ...(statusMessageParts && {
        message: { kind: 'message', role: 'agent', parts: statusMessageParts },
      }),
    },
  } as unknown as A2aTaskWire;
}

const questionTask = (id: string) =>
  task(id, 'input-required', [
    confirmationPart({
      name: 'ask_user',
      args: {
        questions: [
          {
            question: 'What is the actual goal here?',
            choices: ['A sculpture', 'A rideable bike'],
            multiple: false,
          },
        ],
      },
    }),
  ]);

describe('readPendingConfirmation', () => {
  it('reads the question, its choices and the task to resume', () => {
    expect(readPendingConfirmation([questionTask('task-1')])).toEqual({
      taskId: 'task-1',
      asks: 'input',
      toolName: 'ask_user',
      questions: [
        {
          question: 'What is the actual goal here?',
          choices: ['A sculpture', 'A rideable bike'],
          multiple: false,
        },
      ],
    });
  });

  it('reads a free-text question, which carries no choices', () => {
    const pending = readPendingConfirmation([
      task('task-1', 'input-required', [
        confirmationPart({
          name: 'ask_user',
          args: { questions: [{ question: 'Which cluster?' }] },
        }),
      ]),
    ]);

    expect(pending?.questions).toEqual([
      { question: 'Which cluster?', multiple: false },
    ]);
  });

  it('reads a multi-select question', () => {
    const pending = readPendingConfirmation([
      task('task-1', 'input-required', [
        confirmationPart({
          name: 'ask_user',
          args: {
            questions: [
              {
                question: 'Which are true?',
                choices: ['a', 'b'],
                multiple: true,
              },
            ],
          },
        }),
      ]),
    ]);

    expect(pending?.questions[0].multiple).toBe(true);
  });

  it('distinguishes a tool approval from a question', () => {
    const pending = readPendingConfirmation([
      task('task-1', 'input-required', [
        confirmationPart({ name: 'delete_file', args: { path: '/tmp/x' } }),
      ]),
    ]);

    expect(pending).toMatchObject({
      asks: 'approval',
      toolName: 'delete_file',
      questions: [],
    });
  });

  describe('which task counts as pending', () => {
    it('ignores a stranded older question once a newer task has completed', () => {
      // The case that matters most in practice. Every question answered from Slack
      // leaves its task suspended forever, because klaus-gateway sends the task id
      // in a field the A2A server ignores — so a healthy session holds several
      // stranded `input-required` tasks behind a completed newest one. Offering to
      // answer one of those would resume a turn the agent moved past long ago.
      const tasks = [
        questionTask('stranded-1'),
        task('answered-1', 'completed'),
        questionTask('stranded-2'),
        task('answered-2', 'completed'),
      ];

      expect(readPendingConfirmation(tasks)).toBeUndefined();
    });

    it('reads the newest task when that is the one waiting', () => {
      const tasks = [
        questionTask('stranded-1'),
        task('answered-1', 'completed'),
        questionTask('current'),
      ];

      expect(readPendingConfirmation(tasks)?.taskId).toBe('current');
    });

    it('looks past a trailing task that reports no state at all', () => {
      // `readNewestTaskState` skips those, so this must too or the badge and the
      // panel would disagree about which turn is current.
      const tasks = [questionTask('current'), task('no-state', '')];

      expect(readPendingConfirmation(tasks)?.taskId).toBe('current');
    });
  });

  describe('when nothing should be offered', () => {
    it('yields nothing for a session that is not waiting', () => {
      expect(
        readPendingConfirmation([task('task-1', 'completed')]),
      ).toBeUndefined();
    });

    it('yields nothing for an empty conversation', () => {
      expect(readPendingConfirmation([])).toBeUndefined();
    });

    it('yields nothing when the suspended task has no id to resume', () => {
      // Without it an answer cannot name what it resumes, and a taskless answer
      // opens a new task while leaving this one suspended forever.
      const [withoutId] = [questionTask('task-1')];
      delete (withoutId as { id?: unknown }).id;

      expect(readPendingConfirmation([withoutId])).toBeUndefined();
    });

    it('yields nothing when the request is not a confirmation we recognise', () => {
      expect(
        readPendingConfirmation([
          task('task-1', 'input-required', [
            { kind: 'text', text: 'please advise' },
          ]),
        ]),
      ).toBeUndefined();
    });

    it('yields nothing when the task carries no status message', () => {
      expect(
        readPendingConfirmation([task('task-1', 'input-required')]),
      ).toBeUndefined();
    });

    it('drops a question whose text is missing rather than rendering a blank', () => {
      const pending = readPendingConfirmation([
        task('task-1', 'input-required', [
          confirmationPart({
            name: 'ask_user',
            args: {
              questions: [{ choices: ['a'] }, { question: 'Real one?' }],
            },
          }),
        ]),
      ]);

      expect(pending?.questions).toEqual([
        { question: 'Real one?', multiple: false },
      ]);
    });
  });

  describe('a request we cannot read', () => {
    it('offers nothing for an ask_user whose questions are unreadable', () => {
      // Must not degrade into the approval UI. An `input` with no questions renders
      // as "the agent is asking permission to run ask_user" with an Approve button,
      // and approving sends a decision carrying no answers — which kagent treats as
      // "not answered", resuming the task with the question silently dropped. That
      // is the exact strand this feature exists to prevent.
      const pending = readPendingConfirmation([
        task('task-1', 'input-required', [
          confirmationPart({ name: 'ask_user', args: { questions: 'nope' } }),
        ]),
      ]);

      expect(pending).toBeUndefined();
    });

    it('offers nothing for an ask_user with an empty questions array', () => {
      expect(
        readPendingConfirmation([
          task('task-1', 'input-required', [
            confirmationPart({ name: 'ask_user', args: { questions: [] } }),
          ]),
        ]),
      ).toBeUndefined();
    });

    it('still offers a tool approval, which legitimately has no questions', () => {
      // The guard is specific to `ask_user`: an approval never carries questions
      // and must keep working.
      expect(
        readPendingConfirmation([
          task('task-1', 'input-required', [
            confirmationPart({ name: 'delete_file', args: { path: '/tmp/x' } }),
          ]),
        ]),
      ).toMatchObject({ asks: 'approval' });
    });
  });

  it('matches the state case-insensitively, as the state badge does', () => {
    // `describeSessionState` lowercases into `key`, and every other consumer
    // compares that. Comparing the raw string here would make the page take its
    // awaiting-input branch while this returned nothing, so it would claim the
    // request could not be read on a confirmation it could render perfectly.
    expect(
      readPendingConfirmation([
        task('task-1', 'Input-Required', [
          confirmationPart({
            name: 'ask_user',
            args: { questions: [{ question: 'Which cluster?' }] },
          }),
        ]),
      ])?.taskId,
    ).toBe('task-1');
  });

  it('treats auth-required as waiting too', () => {
    // Both states suspend the task on a human; `AWAITING_INPUT_STATES` is shared
    // with the state badge so the two cannot drift.
    expect(
      readPendingConfirmation([
        task('task-1', 'auth-required', [
          confirmationPart({
            name: 'ask_user',
            args: { questions: [{ question: 'Sign in?' }] },
          }),
        ]),
      ])?.taskId,
    ).toBe('task-1');
  });
});
