/**
 * Workspace setup notices as kagent's harness writes them
 * (`Report.TurnNotice()` in kagent's `go/harness/workspace/workspace.go`),
 * with neutral repository names and shortened git output.
 */

export const NOTICE_FAILED =
  'Workspace setup failed: could not create the session directory: no space left on device';

export const NOTICE_RESET =
  "Workspace setup: this session's directory was set up again from the workspace's mirrors. What was pushed is on the provider; what was not pushed is gone.";

export const NOTICE_RECOVERED =
  'Workspace setup: an earlier turn could not clone or fetch these repositories; they are up to date now: acme/app, acme/docs, acme/infra.';

export const NOTICE_STALE = [
  "Workspace setup: these repositories stay at the workspace's last sync.",
  '- acme/app: the origin refused the fetch: fatal: You are attempting to fetch 20fd2e28, which is in the commit graph file but not in the object database.',
  '- acme/docs: the origin refused the fetch: fatal: You are attempting to fetch 0fd5d086, which is in the commit graph file but not in the object database.',
  '- acme/infra: the origin refused the fetch: fatal: You are attempting to fetch d1f41e67, which is in the commit graph file but not in the object database.',
].join('\n');

/**
 * A session of two turns, read from the tasks route (A2A v1): the first opens
 * with the "last sync" notice before the agent's reply, the second with the
 * "up to date now" one. The shape of a real session export, trimmed.
 */
export const sessionWithNotices = {
  tasks: [
    {
      id: 'task-1',
      contextId: 'ctx-1',
      status: {
        state: 'TASK_STATE_COMPLETED',
        message: {
          messageId: 'status-1',
          contextId: 'ctx-1',
          taskId: 'task-1',
          role: 'ROLE_AGENT',
          parts: [{ text: '' }],
        },
        timestamp: '2026-10-26T14:23:03.758418221Z',
      },
      artifacts: [
        {
          artifactId: 'reply-1',
          parts: [
            { text: 'No, the `gh` CLI is not installed' },
            { text: ' here.' },
          ],
          metadata: {
            'kagent.dev/a2a/timeline-position': '2026-10-26T14:23:02Z',
          },
        },
      ],
      history: [
        {
          messageId: 'user-1',
          contextId: 'ctx-1',
          taskId: 'task-1',
          role: 'ROLE_USER',
          parts: [{ text: 'Do you have access to the gh CLI?' }],
          metadata: {
            'kagent.dev/a2a/timeline-position': '2026-10-26T14:22:09Z',
          },
        },
        {
          messageId: 'notice-1',
          contextId: 'ctx-1',
          taskId: 'task-1',
          role: 'ROLE_AGENT',
          parts: [{ text: NOTICE_STALE }],
          metadata: {
            'kagent.dev/a2a/timeline-position': '2026-10-26T14:22:45Z',
          },
        },
      ],
    },
    {
      id: 'task-2',
      contextId: 'ctx-1',
      status: {
        state: 'TASK_STATE_COMPLETED',
        message: {
          messageId: 'status-2',
          contextId: 'ctx-1',
          taskId: 'task-2',
          role: 'ROLE_AGENT',
          parts: [{ text: '' }],
        },
        timestamp: '2026-10-26T14:30:39.416268093Z',
      },
      artifacts: [
        {
          artifactId: 'reply-2',
          parts: [{ text: "I'm Claude." }],
          metadata: {
            'kagent.dev/a2a/timeline-position': '2026-10-26T14:30:38Z',
          },
        },
      ],
      history: [
        {
          messageId: 'user-2',
          contextId: 'ctx-1',
          taskId: 'task-2',
          role: 'ROLE_USER',
          parts: [{ text: "What's your name?" }],
          metadata: {
            'kagent.dev/a2a/timeline-position': '2026-10-26T14:30:27Z',
          },
        },
        {
          messageId: 'notice-2',
          contextId: 'ctx-1',
          taskId: 'task-2',
          role: 'ROLE_AGENT',
          parts: [{ text: NOTICE_RECOVERED }],
          metadata: {
            'kagent.dev/a2a/timeline-position': '2026-10-26T14:30:35Z',
          },
        },
      ],
    },
  ],
};
