import {
  applyStreamEvent,
  createSseDataDecoder,
  createStreamTurn,
  readStreamFrame,
  StreamTurn,
} from './kagentStreamTurn';

describe('createSseDataDecoder', () => {
  it('decodes one event per blank-line delimiter', () => {
    const decoder = createSseDataDecoder();
    expect(decoder.push('data: {"a":1}\n\ndata: {"b":2}\n\n')).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it('reassembles events split across chunk boundaries', () => {
    // The relay hands over whatever the network delivered; frame boundaries
    // land wherever they land.
    const decoder = createSseDataDecoder();
    expect(decoder.push('data: {"a"')).toEqual([]);
    expect(decoder.push(':1}\n')).toEqual([]);
    expect(decoder.push('\n')).toEqual(['{"a":1}']);
  });

  it('ignores id lines, comments and unknown fields', () => {
    // a2a-go writes an `id:` line per event and `: keep-alive` comments when
    // enabled; neither carries payload.
    const decoder = createSseDataDecoder();
    expect(
      decoder.push(
        'id: 123\ndata: {"a":1}\n\n: keep-alive\n\nevent: x\ndata: {"b":2}\n\n',
      ),
    ).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('tolerates CRLF line endings and a missing space after the colon', () => {
    const decoder = createSseDataDecoder();
    expect(decoder.push('data:{"a":1}\r\n\r\n')).toEqual(['{"a":1}']);
  });

  it('joins multiple data lines of one event with newlines', () => {
    const decoder = createSseDataDecoder();
    expect(decoder.push('data: line one\ndata: line two\n\n')).toEqual([
      'line one\nline two',
    ]);
  });

  it('hands over an unterminated final event on end()', () => {
    // A cut stream can end mid-event, after the data line but before the blank
    // line. Whether it is complete JSON is the frame reader's question.
    const decoder = createSseDataDecoder();
    expect(decoder.push('data: {"a":1}')).toEqual([]);
    expect(decoder.end()).toEqual(['{"a":1}']);
  });
});

describe('readStreamFrame', () => {
  it('reads a result frame as an event', () => {
    expect(
      readStreamFrame('{"jsonrpc":"2.0","result":{"kind":"task"}}'),
    ).toEqual({ kind: 'event', result: { kind: 'task' } });
  });

  it('reads an error frame with its own message', () => {
    expect(
      readStreamFrame(
        '{"jsonrpc":"2.0","error":{"code":-32602,"message":"invalid params"}}',
      ),
    ).toEqual({ kind: 'error', message: 'invalid params' });
  });

  it('supplies a wording when the error names no message', () => {
    expect(readStreamFrame('{"jsonrpc":"2.0","error":{}}')).toEqual({
      kind: 'error',
      message: 'the agent rejected the message without saying why',
    });
  });

  it('reports unparseable frames without throwing', () => {
    expect(readStreamFrame('not json')).toEqual({ kind: 'unreadable' });
    expect(readStreamFrame('42')).toEqual({ kind: 'unreadable' });
  });
});

describe('applyStreamEvent', () => {
  /** Run a sequence of events through the reducer. */
  function fold(events: unknown[], turn = createStreamTurn('sent-1')) {
    return events.reduce<StreamTurn>(
      (state, event) => applyStreamEvent(state, event),
      turn,
    );
  }

  const textPart = (text: string) => ({ kind: 'text', text });
  const thoughtPart = (text: string) => ({
    kind: 'text',
    text,
    metadata: { adk_thought: true },
  });
  const callPart = (id: string, name: string, args: unknown = {}) => ({
    kind: 'data',
    data: { id, name, args },
    metadata: { adk_type: 'function_call' },
  });
  const responsePart = (id: string, name: string, response: unknown) => ({
    kind: 'data',
    data: { id, name, response },
    metadata: { adk_type: 'function_response' },
  });

  const statusUpdate = (
    message: unknown,
    options: { final?: boolean; state?: string } = {},
  ) => ({
    kind: 'status-update',
    taskId: 'task-1',
    contextId: 'ctx-1',
    final: options.final ?? false,
    status: { state: options.state ?? 'working', message },
  });

  const agentMessage = (parts: unknown[], messageId = 'reply-1') => ({
    kind: 'message',
    messageId,
    role: 'agent',
    parts,
    metadata: { adk_author: 'issue-tracker' },
  });

  it('marks the turn dispatched on any event, readable or not', () => {
    // Even an event we cannot parse proves kagent is running the turn — which
    // is what spares a later stream failure the verification read.
    expect(fold(['garbage']).dispatched).toBe(true);
    expect(fold([{ kind: 'status-update' }]).dispatched).toBe(true);
  });

  it('reads the task id and state from the task snapshot', () => {
    const turn = fold([
      {
        kind: 'task',
        id: 'task-9',
        contextId: 'ctx-1',
        status: { state: 'Submitted' },
        history: [agentMessage([textPart('old reply')])],
      },
    ]);

    expect(turn.taskId).toBe('task-9');
    expect(turn.stateKey).toBe('submitted');
    // The snapshot's history is the poll's business, not the preview's.
    expect(turn.items).toEqual([]);
  });

  describe('the Python executor flow: text chunks on status updates', () => {
    it('accumulates non-final text of one message into the open run', () => {
      const turn = fold([
        statusUpdate(agentMessage([textPart('The ingress ')])),
        statusUpdate(agentMessage([textPart('is failing because…')])),
      ]);

      expect(turn.live?.text).toBe('The ingress is failing because…');
      expect(turn.items).toEqual([]);
    });

    it('closes the run when a new message starts, rather than gluing them', () => {
      // Two sentences the agent produced as two messages are two paragraphs,
      // not one: concatenating them ran the end of the first straight into the
      // start of the second, with no separator anywhere.
      const turn = fold([
        statusUpdate(agentMessage([textPart('Looking that up now.')], 'm-1')),
        statusUpdate(agentMessage([textPart('Here is the answer.')], 'm-2')),
      ]);

      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'agent-message',
          text: 'Looking that up now.',
          messageId: 'm-1',
        }),
      ]);
      expect(turn.live?.text).toBe('Here is the answer.');
      expect(turn.live?.messageId).toBe('m-2');
    });

    it('separates reasoning chunks from prose chunks', () => {
      const turn = fold([
        statusUpdate(agentMessage([thoughtPart('Let me check the service.')])),
        statusUpdate(agentMessage([textPart('Checking now.')])),
      ]);

      // The reasoning is closed at its own position the moment prose starts, so
      // it stays above the reply instead of being emitted after it.
      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'reasoning',
          text: 'Let me check the service.',
        }),
      ]);
      expect(turn.live).toEqual(
        expect.objectContaining({
          kind: 'agent-message',
          text: 'Checking now.',
        }),
      );
    });

    it('replaces the buffers with the complete message on the final event', () => {
      const turn = fold([
        statusUpdate(agentMessage([textPart('The ingress ')])),
        statusUpdate(
          agentMessage([textPart('The ingress is failing because of X.')]),
          { final: true, state: 'completed' },
        ),
      ]);

      expect(turn.isFinal).toBe(true);
      expect(turn.stateKey).toBe('completed');
      expect(turn.live).toBeUndefined();
      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'agent-message',
          text: 'The ingress is failing because of X.',
          messageId: 'reply-1',
          author: 'issue-tracker',
        }),
      ]);
    });

    it('keeps an earlier message the terminal event does not repeat', () => {
      // The terminal event supersedes its *own* message's chunks and nothing
      // else. Clearing the run unconditionally erased the sentence the agent
      // said before it went to work, which then reappeared out of nowhere when
      // the poll caught up.
      const turn = fold([
        statusUpdate(agentMessage([textPart('Let me look that up.')], 'm-1')),
        statusUpdate(agentMessage([textPart('It is four nodes.')], 'm-2'), {
          final: true,
          state: 'completed',
        }),
      ]);

      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'agent-message',
          text: 'Let me look that up.',
          messageId: 'm-1',
        }),
        expect.objectContaining({
          kind: 'agent-message',
          text: 'It is four nodes.',
          messageId: 'm-2',
        }),
      ]);
    });

    it('flushes the run when the final event carries no readable message', () => {
      const turn = fold([
        statusUpdate(agentMessage([textPart('Partial answer')])),
        { kind: 'status-update', final: true, status: { state: 'completed' } },
      ]);

      expect(turn.live).toBeUndefined();
      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'agent-message',
          text: 'Partial answer',
        }),
      ]);
    });
  });

  describe('the Go executor flow: artifact updates', () => {
    const artifactUpdate = (
      parts: unknown[],
      options: { partial?: boolean; lastChunk?: boolean } = {},
    ) => ({
      kind: 'artifact-update',
      taskId: 'task-1',
      artifact: { artifactId: 'a-1', parts },
      ...(options.lastChunk !== undefined && { lastChunk: options.lastChunk }),
      ...(options.partial !== undefined && {
        metadata: { adk_partial: options.partial },
      }),
    });

    it('accumulates partial chunks into the open run', () => {
      const turn = fold([
        artifactUpdate([textPart('Token by ')], { partial: true }),
        artifactUpdate([textPart('token.')], { partial: true }),
      ]);

      expect(turn.live?.text).toBe('Token by token.');
      expect(turn.items).toEqual([]);
    });

    it('emits the complete artifact as an item and closes the run', () => {
      const turn = fold([
        artifactUpdate([textPart('Token by ')], { partial: true }),
        artifactUpdate([textPart('Token by token.')], { partial: false }),
      ]);

      expect(turn.live).toBeUndefined();
      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'agent-message',
          text: 'Token by token.',
        }),
      ]);
    });

    it('does not duplicate the reply the terminal status update repeats', () => {
      // The Go flow can deliver the same response twice — as the
      // `partial: false` artifact and again on the final status update — and
      // only the second carries a messageId. Identical adjacent text is the
      // dedupe.
      const turn = fold([
        artifactUpdate([textPart('The answer.')], { partial: false }),
        statusUpdate(agentMessage([textPart('The answer.')]), {
          final: true,
          state: 'completed',
        }),
      ]);

      expect(
        turn.items.filter(item => item.kind === 'agent-message'),
      ).toHaveLength(1);
    });

    it('treats an empty lastChunk sentinel as nothing at all', () => {
      const turn = fold([
        artifactUpdate([textPart('Streamed.')], { partial: true }),
        artifactUpdate([{ kind: 'data', data: {} }], { lastChunk: true }),
      ]);

      // The sentinel closes the artifact stream; the run it leaves behind is
      // dropped rather than duplicated by whatever follows.
      expect(turn.items).toEqual([]);
      expect(turn.live).toBeUndefined();
    });
  });

  describe('tool activity', () => {
    it('keeps a call behind the sentence that introduced it', () => {
      // Both travel in one message, text part first — and part order is
      // chronology. Buffering the text while the call became an item straight
      // away inverted every such pair, so a busy turn rendered as a block of
      // tool rows with all the prose collected underneath it.
      const turn = fold([
        statusUpdate(
          agentMessage(
            [
              textPart('Making a live call to fetch the node list.'),
              callPart('call-1', 'kubectl_get'),
            ],
            'm-1',
          ),
        ),
      ]);

      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'agent-message',
          text: 'Making a live call to fetch the node list.',
          messageId: 'm-1',
        }),
        expect.objectContaining({
          kind: 'tool-call',
          toolName: 'kubectl_get',
          messageId: 'm-1',
        }),
      ]);
      expect(turn.live).toBeUndefined();
    });

    it('renders a whole turn in the order it happened', () => {
      // The shape kagent's Python executor actually produces: a sentence and a
      // call in one message, the response in the next, the reply in a third.
      const turn = fold([
        statusUpdate(
          agentMessage(
            [
              textPart('Fetching the nodes.'),
              callPart('call-1', 'kubectl_get'),
            ],
            'm-1',
          ),
        ),
        statusUpdate(
          agentMessage([responsePart('call-1', 'kubectl_get', 'ok')], 'm-2'),
        ),
        statusUpdate(agentMessage([textPart('There are seven.')], 'm-3')),
      ]);

      expect(
        turn.items.map(item =>
          item.kind === 'tool-call'
            ? `tool:${item.toolName}`
            : `text:${item.kind}`,
        ),
      ).toEqual(['text:agent-message', 'tool:kubectl_get']);
      expect(turn.items[1]).toEqual(
        expect.objectContaining({ isPending: false, result: 'ok' }),
      );
      expect(turn.live?.text).toBe('There are seven.');
    });

    it('shows a call as pending, then folds its response in', () => {
      const afterCall = fold([
        statusUpdate(agentMessage([callPart('call-1', 'kubectl_get')])),
      ]);
      expect(afterCall.items).toEqual([
        expect.objectContaining({
          kind: 'tool-call',
          toolName: 'kubectl_get',
          isPending: true,
        }),
      ]);

      const afterResponse = fold(
        [
          statusUpdate(
            agentMessage(
              [responsePart('call-1', 'kubectl_get', { pods: 3 })],
              'reply-2',
            ),
          ),
        ],
        afterCall,
      );
      expect(afterResponse.items).toEqual([
        expect.objectContaining({
          kind: 'tool-call',
          toolName: 'kubectl_get',
          isPending: false,
          result: { pods: 3 },
        }),
      ]);
    });

    it('looks through muster’s call_tool wrapper', () => {
      const turn = fold([
        statusUpdate(
          agentMessage([
            callPart('call-1', 'call_tool', {
              name: 'x_kubernetes_get',
              arguments: { kind: 'Pod' },
            }),
          ]),
        ),
      ]);

      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'tool-call',
          toolName: 'x_kubernetes_get',
          via: 'Muster',
          args: { kind: 'Pod' },
        }),
      ]);
    });

    it('renders a delegation to another agent as an agent call', () => {
      const turn = fold([
        statusUpdate(
          agentMessage([callPart('call-1', 'kagent__NS__sre_agent')]),
        ),
      ]);

      expect(turn.items).toEqual([
        expect.objectContaining({
          kind: 'agent-call',
          agentId: 'kagent__NS__sre_agent',
        }),
      ]);
    });

    it('previews neither a confirmation request nor its plumbing', () => {
      // The answer panel works off the polled task, which is the one that can
      // actually resume it — a preview here would invite answering something
      // that cannot be answered yet.
      const turn = fold([
        statusUpdate(
          agentMessage([
            callPart('call-1', 'adk_request_confirmation', {
              originalFunctionCall: { name: 'dangerous_tool' },
            }),
          ]),
          { state: 'input-required' },
        ),
      ]);

      expect(turn.items).toEqual([]);
      expect(turn.stateKey).toBe('input-required');
    });
  });

  it('ignores the user’s own message coming back', () => {
    // kagent repeats the user message on stream events exactly as it repeats it
    // in history; the optimistic copy is already on screen.
    const turn = fold([
      statusUpdate({
        kind: 'message',
        messageId: 'sent-1',
        role: 'user',
        parts: [textPart('my question')],
      }),
    ]);

    expect(turn.items).toEqual([]);
    expect(turn.live).toBeUndefined();
  });

  it('skips a complete message it has already ingested', () => {
    const event = statusUpdate(agentMessage([textPart('Once.')]), {
      final: true,
    });
    const turn = fold([event, event]);

    expect(turn.items).toHaveLength(1);
  });

  it('never mutates the state it was given', () => {
    const before = fold([
      statusUpdate(agentMessage([callPart('call-1', 'kubectl_get')])),
    ]);
    const snapshot = JSON.parse(JSON.stringify(before));

    fold(
      [
        statusUpdate(
          agentMessage(
            [responsePart('call-1', 'kubectl_get', { ok: true })],
            'reply-2',
          ),
        ),
        statusUpdate(agentMessage([textPart('done')]), { final: true }),
      ],
      before,
    );

    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });
});
