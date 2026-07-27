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
  ])('treats %s as not user-scoped', (_label, input) => {
    // We cannot confirm scoping, and wrongly claiming it is the more misleading
    // of the two errors.
    expect(isUserScopedSubject(input)).toBe(false);
  });
});

describe('FALLBACK_KAGENT_CAPABILITIES', () => {
  it('claims nothing', () => {
    expect(FALLBACK_KAGENT_CAPABILITIES).toEqual({ isUserScoped: undefined });
  });
});
