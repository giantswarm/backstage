import type { Notification } from '@backstage/plugin-notifications-common';
import { notificationHref, toUpstreamRows } from './upstreamRows';

const ORIGIN = 'https://portal.example.com';

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
    // eslint-disable-next-line no-script-url
    ['javascript:alert(1)', undefined],
    ['mailto:someone@example.com', undefined],
    ['   ', undefined],
    [undefined, undefined],
  ])('%s → %j', (link, expected) => {
    expect(notificationHref(link, ORIGIN)).toEqual(expected);
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
    const [row] = toUpstreamRows([
      notification({
        payload: {
          title: 'Template run failed',
          description: '  Create a Go service  ',
          severity: 'critical',
        },
      }),
    ]);
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
      toUpstreamRows([notification({ read: '2026-10-16T11:00:00Z' as any })])[0]
        .unread,
    ).toBe(false);
  });

  it('gives a notification sent again a new identity, aged from then', () => {
    const updated = '2026-10-16T12:00:00.000Z';
    const [row] = toUpstreamRows([notification({ updated: updated as any })]);
    expect(row.at).toBe(Date.parse(updated));
    expect(row.id).toBe(`notification:n1:${Date.parse(updated)}`);
    expect(row.subject).toBe('notification:n1');
  });
});
