import type { A2aTaskWire } from '@giantswarm/backstage-plugin-agent-platform-common';
import { buildTimeline, TimelineItem } from './kagentTimeline';
import {
  egressOriginFor,
  egressRefusalsQuery,
  isOriginScheme,
  readEgressRefusals,
  sessionActor,
  withEgressRefusals,
} from './egressRefusals';

const T0 = Date.parse('2026-10-19T10:00:00Z') / 1000;
const iso = (offset: number) => new Date((T0 + offset) * 1000).toISOString();

describe('sessionActor', () => {
  it('names the actor kagent runs a Session as, in the agent namespace', () => {
    expect(sessionActor('9F1C-AB', 'agents')).toEqual({
      atespace: 'agents',
      name: 'session-9f1c-ab',
    });
  });
});

describe('egressRefusalsQuery', () => {
  it('asks for one actor only, its label values escaped', () => {
    expect(egressRefusalsQuery({ atespace: 'a"b', name: 'session-1' })).toBe(
      'sum by (scheme, host, port) (agentgateway_atenet_egress_refusals_total{ate_atespace="a\\"b",ate_actor_name="session-1"})',
    );
  });
});

describe('readEgressRefusals', () => {
  it('reads each rise of a counter, a first sample whole and a reset from zero', () => {
    const refusals = readEgressRefusals([
      {
        metric: { scheme: 'https', host: 'proxy.golang.org', port: '443' },
        values: [
          [T0, '2'],
          [T0 + 30, '2'],
          [T0 + 60, '5'],
          [T0 + 90, '1'],
        ],
      },
      {
        metric: { scheme: 'tcp', host: 'other', port: '0' },
        values: [[T0 + 45, '1']],
      },
    ]);
    expect(refusals).toEqual([
      {
        scheme: 'https',
        host: 'proxy.golang.org',
        port: 443,
        at: iso(0),
        since: undefined,
        count: 2,
      },
      {
        scheme: 'tcp',
        host: undefined,
        port: undefined,
        at: iso(45),
        since: undefined,
        count: 1,
      },
      {
        scheme: 'https',
        host: 'proxy.golang.org',
        port: 443,
        at: iso(60),
        since: iso(30),
        count: 3,
      },
      {
        scheme: 'https',
        host: 'proxy.golang.org',
        port: 443,
        at: iso(90),
        since: iso(60),
        count: 1,
      },
    ]);
  });
});

describe('egressOriginFor', () => {
  it('is the origin spec.egress takes, the default port left out', () => {
    expect(
      egressOriginFor({ scheme: 'https', host: 'proxy.golang.org', port: 443 }),
    ).toBe('https://proxy.golang.org');
    expect(
      egressOriginFor({ scheme: 'https', host: 'git.example', port: 8443 }),
    ).toBe('https://git.example:8443');
    expect(
      egressOriginFor({ scheme: 'http', host: 'a.example', port: 80 }),
    ).toBe('http://a.example');
  });

  it('is none for tcp or an unnamed host', () => {
    expect(
      egressOriginFor({ scheme: 'tcp', host: '10.0.0.1', port: 22 }),
    ).toBeUndefined();
    expect(
      egressOriginFor({ scheme: 'tls', host: 'db.example', port: 5432 }),
    ).toBeUndefined();
    expect(egressOriginFor({ scheme: 'https', port: 443 })).toBeUndefined();
  });
});

describe('isOriginScheme', () => {
  it('is HTTP and HTTPS only, the schemes an egress origin names', () => {
    expect(isOriginScheme('https')).toBe(true);
    expect(isOriginScheme('http')).toBe(true);
    expect(isOriginScheme('tcp')).toBe(false);
    expect(isOriginScheme('TCP')).toBe(false);
    expect(isOriginScheme('tls')).toBe(false);
    expect(isOriginScheme('')).toBe(false);
  });
});

describe('withEgressRefusals', () => {
  const items: TimelineItem[] = [
    { kind: 'user-message', id: 'u0', taskIndex: 0, at: iso(100), text: 'a' },
    {
      kind: 'tool-call',
      id: 't0',
      taskIndex: 0,
      at: iso(100),
      toolName: 'shell',
      isPending: false,
    },
    { kind: 'agent-message', id: 'a0', taskIndex: 0, at: iso(100), text: 'b' },
    { kind: 'user-message', id: 'u1', taskIndex: 1, at: iso(300), text: 'c' },
    { kind: 'agent-message', id: 'a1', taskIndex: 1, at: iso(300), text: 'd' },
  ];
  const refusal = (at: number, since?: number, host = 'proxy.golang.org') => ({
    scheme: 'https',
    host,
    port: 443,
    at: iso(at),
    since: since === undefined ? undefined : iso(since),
    count: 1,
  });

  it('puts a refusal on the turn that ended after it, before its answer', () => {
    const result = withEgressRefusals(items, [refusal(120, 60)]);
    expect(result.map(item => item.id)).toEqual([
      'u0',
      't0',
      'egress-refused:0|https|proxy.golang.org|443',
      'a0',
      'u1',
      'a1',
    ]);
  });

  it('counts one entry per turn and destination', () => {
    const result = withEgressRefusals(items, [
      refusal(150, 120),
      refusal(180, 150),
      refusal(210, 180, 'sum.golang.org'),
    ]);
    const entries = result.filter(item => item.kind === 'egress-refused');
    expect(
      entries.map(item => [
        item.taskIndex,
        item.kind === 'egress-refused' && item.host,
        item.kind === 'egress-refused' && item.count,
      ]),
    ).toEqual([
      [1, 'proxy.golang.org', 2],
      [1, 'sum.golang.org', 1],
    ]);
    expect(result[result.length - 1].id).toBe('a1');
  });

  it('puts a refusal after every turn on the newest one', () => {
    const result = withEgressRefusals(items, [refusal(400, 330)]);
    expect(result.slice(-2).map(item => item.id)).toEqual([
      'egress-refused:1|https|proxy.golang.org|443',
      'a1',
    ]);
  });

  it('leaves a timeline without refusals as it is', () => {
    expect(withEgressRefusals(items, [])).toBe(items);
  });

  it('uses the latest activity in a turn to place its refusals', () => {
    const timeline: TimelineItem[] = [
      { kind: 'user-message', id: 'u0', taskIndex: 0, at: iso(0), text: 'a' },
      {
        kind: 'agent-message',
        id: 'a0',
        taskIndex: 0,
        at: iso(100),
        text: 'b',
      },
      { kind: 'user-message', id: 'u1', taskIndex: 1, at: iso(200), text: 'c' },
      {
        kind: 'agent-message',
        id: 'a1',
        taskIndex: 1,
        at: iso(300),
        text: 'd',
      },
    ];
    const result = withEgressRefusals(timeline, [refusal(90, 60)]);
    expect(result.find(item => item.kind === 'egress-refused')?.taskIndex).toBe(
      0,
    );
    expect(result.map(item => item.id)).toEqual([
      'u0',
      'egress-refused:0|https|proxy.golang.org|443',
      'a0',
      'u1',
      'a1',
    ]);
  });

  it.each<[string, number | undefined, number, number]>([
    ['completion', 100, 95, 96],
    ['folded response', 10, 95, 60],
    ['response without a task timestamp', undefined, 95, 60],
  ])(
    'uses %s to keep a refusal on its turn',
    (_label, completed, responded, since) => {
      const tasks: A2aTaskWire[] = [
        {
          status: {
            state: 'completed',
            timestamp: completed === undefined ? undefined : iso(completed),
          },
          history: [
            {
              role: 'agent',
              messageId: 'call',
              metadata: { 'kagent.dev/a2a/timeline-position': iso(10) },
              parts: [
                {
                  kind: 'data',
                  metadata: { kagent_type: 'function_call' },
                  data: { id: 'call', name: 'shell', args: {} },
                },
              ],
            },
            {
              role: 'agent',
              messageId: 'response',
              metadata: { 'kagent.dev/a2a/timeline-position': iso(responded) },
              parts: [
                {
                  kind: 'data',
                  metadata: { kagent_type: 'function_response' },
                  data: { id: 'call', name: 'shell', response: { ok: false } },
                },
              ],
            },
          ],
        },
        {
          status: { state: 'completed', timestamp: iso(300) },
          history: [{ role: 'user', parts: [{ text: 'Next turn' }] }],
        },
      ];
      const timeline = buildTimeline(tasks);
      expect(timeline.items).toHaveLength(2);
      expect(timeline.items[0]).toMatchObject({
        kind: 'tool-call',
        at: iso(10),
        isPending: false,
      });
      const result = withEgressRefusals(
        timeline.items,
        [refusal(99, since)],
        tasks,
      );
      expect(result.map(item => [item.kind, item.taskIndex])).toEqual([
        ['tool-call', 0],
        ['egress-refused', 0],
        ['user-message', 1],
      ]);
    },
  );
});
