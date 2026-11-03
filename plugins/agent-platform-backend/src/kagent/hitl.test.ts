import type { Task } from './gen/a2a_pb';
import {
  buildHitlResponse,
  HITL_EXTENSION_URI,
  HITL_TYPE_URL_ELICITATION_REQUEST,
  readHitlRequest,
} from './hitl';

function pausedOn(payload: Record<string, unknown>): Task {
  return {
    id: 'task-1',
    status: {
      message: {
        extensions: [HITL_EXTENSION_URI],
        metadata: { [HITL_EXTENSION_URI]: payload },
      },
    },
  } as unknown as Task;
}

describe('a sign-in the task waits on', () => {
  const task = pausedOn({
    type: 'url_elicitation_request',
    id: 'sign-in-1',
    server: 'muster',
    message: 'Sign in to github to continue.',
    url: 'https://muster.example/oauth/proxy/start?state=abc',
  });

  it('is read with its correlation id', () => {
    expect(readHitlRequest(task)).toEqual({
      type: HITL_TYPE_URL_ELICITATION_REQUEST,
      id: 'sign-in-1',
    });
  });

  it.each([
    ['approve', 'accept'],
    ['reject', 'decline'],
  ] as const)('is answered %s as %s', (decision, action) => {
    expect(buildHitlResponse(readHitlRequest(task)!, { decision })).toEqual({
      type: 'url_elicitation_response',
      id: 'sign-in-1',
      action,
    });
  });

  it('without an id is not offered', () => {
    expect(
      readHitlRequest(pausedOn({ type: 'url_elicitation_request' })),
    ).toBeUndefined();
  });
});
