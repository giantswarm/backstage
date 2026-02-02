import { parseFluxRevision } from './parseFluxRevision';

describe('parseFluxRevision', () => {
  it('handles legacy 40-char SHA format', () => {
    expect(parseFluxRevision('da19eed209e82ec009912e5c0396343651030972')).toBe(
      'da19eed209e82ec009912e5c0396343651030972',
    );
  });

  it('extracts SHA from branch@sha1:commit format', () => {
    expect(
      parseFluxRevision('main@sha1:da19eed209e82ec009912e5c0396343651030972'),
    ).toBe('da19eed209e82ec009912e5c0396343651030972');
  });

  it('extracts SHA from tag@sha1:commit format', () => {
    expect(
      parseFluxRevision('v2.2.0@sha1:81606709114f6d16a432f9f4bfc774942f054327'),
    ).toBe('81606709114f6d16a432f9f4bfc774942f054327');
  });

  it('handles digest-only format', () => {
    expect(
      parseFluxRevision(
        'sha256:8fb62a09c9e48ace5463bf940dc15e85f525be4f230e223bbceef6e13024110c',
      ),
    ).toBe('8fb62a09c9e48ace5463bf940dc15e85f525be4f230e223bbceef6e13024110c');
  });

  it('handles named pointer with @ in path', () => {
    expect(parseFluxRevision('feature/test@fix@sha1:abc123')).toBe('abc123');
  });

  it('handles named pointer only (Helm chart version)', () => {
    expect(parseFluxRevision('1.2.3')).toBe('1.2.3');
  });
});
