import {
  FALLBACK_KAGENT_CAPABILITIES,
  isUserScopedSubject,
} from './kagentCapabilities';

describe('isUserScopedSubject', () => {
  it('treats a real user subject as user-scoped', () => {
    expect(isUserScopedSubject('marian@giantswarm.io')).toBe(true);
  });

  it('treats kagent’s unsecure-mode default user as not user-scoped', () => {
    // In `unsecure` mode kagent ignores the forwarded token and resolves every
    // caller to this subject, so the list is not the signed-in user's.
    expect(isUserScopedSubject('admin@kagent.dev')).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
  ])(
    'reports %s as unknown rather than as not user-scoped',
    (_label, input) => {
      // Distinct from a confirmed shared user: /api/me returns the token's claims
      // verbatim, so a healthy deployment whose IdP omits `sub` lands here and must
      // not be flagged. Callers treat undefined as "stay silent".
      expect(isUserScopedSubject(input)).toBeUndefined();
    },
  );
});

describe('FALLBACK_KAGENT_CAPABILITIES', () => {
  it('claims nothing', () => {
    expect(FALLBACK_KAGENT_CAPABILITIES).toEqual({ isUserScoped: undefined });
  });
});
