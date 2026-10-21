import type { Notification } from '@backstage/plugin-notifications-common';
import {
  appLocationOf,
  notificationHref,
  toUpstreamRows,
} from './upstreamRows';

const ORIGIN = 'https://portal.example.com';
const AT_ROOT = appLocationOf(ORIGIN);
const UNDER_PATH = appLocationOf(`${ORIGIN}/portal/`);

describe('appLocationOf', () => {
  it('takes the origin and the path the app is served under', () => {
    expect(AT_ROOT).toEqual({ origin: ORIGIN, basePath: '' });
    expect(UNDER_PATH).toEqual({ origin: ORIGIN, basePath: '/portal' });
  });
});

describe('notificationHref', () => {
  it.each([
    ['/create/tasks/abc', { href: '/create/tasks/abc', external: false }],
    ['create/tasks/abc', { href: '/create/tasks/abc', external: false }],
    [
      `${ORIGIN}/catalog/default/component/x?tab=ci#top`,
      { href: '/catalog/default/component/x?tab=ci#top', external: false },
    ],
    [
      'https://ci.example.com/runs/42',
      { href: 'https://ci.example.com/runs/42', external: true },
    ],
    // Protocol-relative: another origin, not a path in the app.
    ['//other.example/x', { href: 'https://other.example/x', external: true }],
    ['/\\other.example/x', { href: 'https://other.example/x', external: true }],
    // A same-origin path that starts with `//` or `/\` is protocol-relative as
    // an href: it stays the whole same-origin URL.
    [
      `${ORIGIN}//evil.example/x`,
      { href: `${ORIGIN}//evil.example/x`, external: true },
    ],
    [
      `${ORIGIN}/\\evil.example`,
      { href: `${ORIGIN}//evil.example`, external: true },
    ],
    [
      '/.//evil.example/x',
      { href: `${ORIGIN}//evil.example/x`, external: true },
    ],
    // eslint-disable-next-line no-script-url
    ['javascript:alert(1)', undefined],
    ['mailto:someone@example.com', undefined],
    ['   ', undefined],
    [undefined, undefined],
  ])('at the root: %s → %j', (link, expected) => {
    expect(notificationHref(link, AT_ROOT)).toEqual(expected);
  });

  it.each([
    // A path is relative to the app already; the router adds the base path.
    ['/create', { href: '/create', external: false }],
    // A whole URL carries the base path, which the router would add again.
    [`${ORIGIN}/portal/create?x=1`, { href: '/create?x=1', external: false }],
    [`${ORIGIN}/portal`, { href: '/', external: false }],
    // Same origin, outside the app.
    [
      `${ORIGIN}/grafana/d/1`,
      { href: `${ORIGIN}/grafana/d/1`, external: true },
    ],
    // Inside the app, but `//` after the base path.
    [
      `${ORIGIN}/portal//evil.example/x`,
      { href: `${ORIGIN}/portal//evil.example/x`, external: true },
    ],
    [
      `${ORIGIN}/portal/\\evil.example`,
      { href: `${ORIGIN}/portal//evil.example`, external: true },
    ],
  ])('under a base path: %s → %j', (link, expected) => {
    expect(notificationHref(link, UNDER_PATH)).toEqual(expected);
  });
});

describe('toUpstreamRows', () => {
  const notification = (overrides: Partial<Notification> = {}) =>
    ({
      id: 'n1',
      user: 'user:default/alex',
      origin: 'plugin:scaffolder',
      created: '2026-10-16T10:00:00.000Z',
      payload: { title: 'Template run finished', severity: 'normal' },
      ...overrides,
    }) as unknown as Notification;

  it('makes a plain row with the store read state', () => {
    const [row] = toUpstreamRows(
      [
        notification({
          payload: {
            title: 'Template run failed',
            description: '  Create a Go service  ',
            severity: 'critical',
          },
        }),
      ],
      AT_ROOT,
    );
    expect(row).toMatchObject({
      id: `notification:n1:${Date.parse('2026-10-16T10:00:00.000Z')}`,
      subject: 'notification:n1',
      kind: 'plain',
      notificationId: 'n1',
      unread: true,
      title: 'Template run failed',
      context: 'Create a Go service',
      announce: { status: 'danger', description: 'Create a Go service' },
    });
    expect(
      toUpstreamRows(
        [notification({ read: '2026-10-16T11:00:00Z' as any })],
        AT_ROOT,
      )[0].unread,
    ).toBe(false);
  });

  it('gives a notification sent again a new identity, aged from then', () => {
    const updated = '2026-10-16T12:00:00.000Z';
    const [row] = toUpstreamRows(
      [notification({ updated: updated as any })],
      AT_ROOT,
    );
    expect(row.at).toBe(Date.parse(updated));
    expect(row.id).toBe(`notification:n1:${Date.parse(updated)}`);
    expect(row.subject).toBe('notification:n1');
  });
});
