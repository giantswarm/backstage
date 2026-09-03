import { DERIVED_TITLE_MAX_LENGTH, deriveSessionTitle } from './sessionTitle';

describe('deriveSessionTitle', () => {
  it('keeps a short prompt as it is', () => {
    expect(deriveSessionTitle('Why is the ingress failing?')).toBe(
      'Why is the ingress failing?',
    );
  });

  it('trims the ends', () => {
    expect(deriveSessionTitle('  Check the cluster  ')).toBe(
      'Check the cluster',
    );
  });

  it('collapses newlines and runs of whitespace into single spaces', () => {
    // A prompt may be several paragraphs; a title is one line.
    expect(
      deriveSessionTitle('Check the cluster.\n\nThen   report   back.'),
    ).toBe('Check the cluster. Then report back.');
  });

  it('cuts a long prompt back to a word boundary and marks the cut', () => {
    const title = deriveSessionTitle(
      'Investigate why the ingress controller keeps restarting on the gazelle management cluster',
    );

    expect(title).toBe(
      'Investigate why the ingress controller keeps restarting on…',
    );
    expect(title.length).toBeLessThanOrEqual(DERIVED_TITLE_MAX_LENGTH + 1);
  });

  it('cuts mid-word rather than throw most of the title away', () => {
    // One very long word: there is no boundary worth honouring, so the prefix
    // wins over a two-word title.
    const title = deriveSessionTitle(`Debug ${'x'.repeat(100)}`);

    expect(title).toBe(`Debug ${'x'.repeat(DERIVED_TITLE_MAX_LENGTH - 6)}…`);
  });

  it('does not leave punctuation stranded before the ellipsis', () => {
    const title = deriveSessionTitle(
      'Look at the ingress, the service, and the endpoints, then tell me what broke',
    );

    expect(title).not.toMatch(/[,\s]…$/);
    expect(title.endsWith('…')).toBe(true);
  });

  it('returns an empty string for a prompt of pure whitespace', () => {
    // The composer never submits one, and the backend rejects it — this only
    // says the helper does not invent a title.
    expect(deriveSessionTitle('   \n  ')).toBe('');
  });
});
