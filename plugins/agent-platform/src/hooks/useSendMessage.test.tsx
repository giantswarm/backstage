import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  InvalidateQueryFilters,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { useSendMessage } from './useSendMessage';

const sendMessage = jest.fn();

const kagentApi = { sendMessage } as unknown as KagentApi;

const AGENT = { namespace: 'kagent', name: 'issue-tracker' };

function renderWith() {
  return renderWithAgent(AGENT);
}

function renderWithoutAgent() {
  return renderWithAgent(undefined);
}

function renderWithAgent(
  agent: { namespace: string; name: string } | undefined,
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );

  return {
    ...renderHook(() => useSendMessage('gazelle', 'abc', agent), { wrapper }),
    invalidateQueries,
  };
}

/** The filters a given call to `invalidateQueries` was made with. */
function invalidationFor(
  invalidateQueries: jest.SpyInstance,
  queryKey: unknown[],
): InvalidateQueryFilters | undefined {
  const call = invalidateQueries.mock.calls.find(
    ([filters]) =>
      JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey),
  );
  return call?.[0];
}

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue(undefined);
});

describe('useSendMessage', () => {
  it('sends the message to the session and its agent', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.sendMessage('why is the ingress failing?');
    });

    expect(sendMessage).toHaveBeenCalledWith(
      'gazelle',
      'abc',
      AGENT,
      expect.objectContaining({ text: 'why is the ingress failing?' }),
    );
  });

  it('generates a message id, so the sent message can be recognised later', async () => {
    // The id has to exist before the request is made: it is what lets the
    // optimistically rendered message be matched to kagent's stored copy and
    // dropped, rather than showing twice for the rest of the turn.
    const { result } = renderWith();

    await act(async () => {
      await result.current.sendMessage('first');
    });
    await act(async () => {
      await result.current.sendMessage('second');
    });

    const ids = sendMessage.mock.calls.map(
      ([, , , message]) => message.messageId,
    );
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toEqual(ids[1]);
  });

  it('exposes the message as pending while the turn runs', async () => {
    // A turn can last minutes, and this is what the conversation renders in the
    // meantime — so it must be readable for the whole time the mutation is in
    // flight, not only at the moment of submitting.
    let release: () => void = () => {};
    sendMessage.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );

    const { result } = renderWith();

    act(() => {
      void result.current.sendMessage('take your time');
    });

    await waitFor(() => expect(result.current.isSending).toBe(true));
    expect(result.current.pending).toEqual(
      expect.objectContaining({ text: 'take your time' }),
    );
    expect(result.current.pending?.messageId).toBeTruthy();

    await act(async () => {
      release();
    });

    // Cleared on success, by which point the invalidation has been awaited and
    // kagent's own copy of the message is readable.
    await waitFor(() => expect(result.current.pending).toBeNull());
  });

  it('refreshes the conversation once the turn is recorded', async () => {
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    const filters = invalidationFor(invalidateQueries, [
      'agent-platform',
      'kagent',
      'session-tasks',
      'gazelle',
      'abc',
    ]);
    expect(filters).toBeDefined();
    // Refetched, not merely marked stale: the user stays on the page and the
    // pending stand-in is only dropped once the real message can be read.
    expect(filters?.refetchType).toBeUndefined();
  });

  it('refreshes the session, whose last activity the turn moved', async () => {
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(
      invalidationFor(invalidateQueries, [
        'agent-platform',
        'kagent',
        'session',
        'gazelle',
        'abc',
      ]),
    ).toBeDefined();
  });

  it('surfaces a failure and drops the pending message', async () => {
    // Nothing was recorded, so the stand-in has to go — otherwise the transcript
    // keeps showing a message that was never sent.
    sendMessage.mockRejectedValue(new Error('kagent said no'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('hello')).rejects.toThrow(
        'kagent said no',
      );
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('kagent said no'),
    );
    expect(result.current.pending).toBeNull();
  });

  it('hands the failed message back so its text is not lost', async () => {
    // The stand-in is dropped — nothing was recorded — but the composer cleared
    // itself on submit, so this is the only remaining copy of what was typed.
    sendMessage.mockRejectedValue(new Error('kagent said no'));
    const { result } = renderWith();

    await act(async () => {
      await expect(
        result.current.sendMessage('an expensive prompt'),
      ).rejects.toThrow();
    });

    await waitFor(() =>
      expect(result.current.failed).toEqual(
        expect.objectContaining({ text: 'an expensive prompt' }),
      ),
    );
    expect(result.current.pending).toBeNull();
  });

  it('carries a fresh id per failed attempt, so the same text restores again', async () => {
    sendMessage.mockRejectedValue(new Error('nope'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('same')).rejects.toThrow();
    });
    const first = result.current.failed?.messageId;

    await act(async () => {
      await expect(result.current.sendMessage('same')).rejects.toThrow();
    });

    await waitFor(() =>
      expect(result.current.failed?.messageId).not.toBe(first),
    );
  });

  it('clears the failed message when a later send succeeds', async () => {
    sendMessage.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('first try')).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.failed).not.toBeNull());

    sendMessage.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.sendMessage('second try');
    });

    await waitFor(() => expect(result.current.failed).toBeNull());
  });

  it('does not invalidate anything when the send failed', async () => {
    sendMessage.mockRejectedValue(new Error('nope'));
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('hello')).rejects.toThrow();
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('refuses to send when the session has no resolvable agent', async () => {
    // The composer is withheld in this case, so this is a guard rather than a
    // user-facing path — but it must not build a request out of `undefined`.
    const { result } = renderWithoutAgent();

    await act(async () => {
      await expect(result.current.sendMessage('hello')).rejects.toThrow(
        /agent for this session is unknown/,
      );
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('clears the error on reset', async () => {
    sendMessage.mockRejectedValue(new Error('nope'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('hello')).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reset());

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('keeps a stable object identity across rerenders', async () => {
    // The page passes this down into memoized elements, so a new object every
    // render would defeat them.
    const { result, rerender } = renderWith();

    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
