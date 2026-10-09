import {
  parseCreatedSessionShare,
  parseSessionShareList,
} from './sessionShares';

describe('parseSessionShareList', () => {
  it('parses the proto3 JSON of a ListSessionSharesResponse', () => {
    const shares = parseSessionShareList({
      shares: [
        {
          id: 'share-1',
          sessionId: 'abc',
          permission: 'SESSION_SHARE_PERMISSION_READ_ONLY',
          createdAt: '2026-10-09T10:00:00Z',
          expiresAt: '2026-10-10T10:00:00Z',
        },
        {
          id: 'share-2',
          sessionId: 'abc',
          permission: 'SESSION_SHARE_PERMISSION_READ_WRITE',
          createdAt: '2026-10-09T10:00:00Z',
        },
      ],
    });

    expect(shares).toEqual([
      {
        id: 'share-1',
        permission: 'read-only',
        createdAt: '2026-10-09T10:00:00Z',
        expiresAt: '2026-10-10T10:00:00Z',
      },
      {
        id: 'share-2',
        permission: 'read-write',
        createdAt: '2026-10-09T10:00:00Z',
        // Unset means the share never expires.
        expiresAt: undefined,
      },
    ]);
  });

  it('tolerates the numeric enum form', () => {
    // proto3 JSON legally renders an enum as its number too.
    const shares = parseSessionShareList({
      shares: [{ id: 's', permission: 2 }],
    });
    expect(shares[0].permission).toBe('read-write');
  });

  it('keeps a future permission visible as unknown rather than mislabeling it', () => {
    const shares = parseSessionShareList({
      shares: [{ id: 's', permission: 'SESSION_SHARE_PERMISSION_ADMIN' }],
    });
    expect(shares[0].permission).toBe('unknown');
  });

  it.each([
    ['an empty object', {}],
    ['a null body', null],
    ['a non-array shares field', { shares: 'nope' }],
  ])('resolves empty for %s', (_label, body) => {
    expect(parseSessionShareList(body)).toEqual([]);
  });

  it('drops a row without an id rather than failing the list', () => {
    const shares = parseSessionShareList({
      shares: [{ permission: 1 }, { id: 'good', permission: 1 }],
    });
    expect(shares).toHaveLength(1);
    expect(shares[0].id).toBe('good');
  });
});

describe('parseCreatedSessionShare', () => {
  it('parses the token and the share', () => {
    const created = parseCreatedSessionShare({
      share: {
        id: 'share-1',
        permission: 'SESSION_SHARE_PERMISSION_READ_ONLY',
        expiresAt: '2026-10-10T10:00:00Z',
      },
      token: 'secret',
    });

    expect(created?.token).toBe('secret');
    expect(created?.share?.id).toBe('share-1');
    expect(created?.share?.permission).toBe('read-only');
  });

  it('still resolves when the share metadata is unreadable — the token is the point', () => {
    const created = parseCreatedSessionShare({ token: 'secret', share: 42 });
    expect(created).toEqual({ token: 'secret', share: undefined });
  });

  it.each([
    ['no token', { share: { id: 's' } }],
    ['an empty token', { token: '' }],
    ['a non-string token', { token: 7 }],
    ['no body', undefined],
  ])(
    'returns undefined for %s — a share without its token is lost',
    (_label, body) => {
      expect(parseCreatedSessionShare(body)).toBeUndefined();
    },
  );
});
