import { deriveChartTag } from './useEditDeploymentData';

describe('deriveChartTag', () => {
  it('returns undefined when ref is undefined', () => {
    expect(deriveChartTag(undefined)).toBeUndefined();
  });

  it('returns tag when ref.tag is set', () => {
    expect(deriveChartTag({ tag: '1.2.3' })).toBe('1.2.3');
  });

  it('returns undefined when only digest is set', () => {
    expect(deriveChartTag({ digest: 'sha256:abc' })).toBeUndefined();
  });

  describe('concrete semver ranges', () => {
    it('extracts version from >= range', () => {
      expect(deriveChartTag({ semver: '>=1.2.3 <2.0.0' })).toBe('1.2.3');
    });

    it('extracts version from tilde range', () => {
      expect(deriveChartTag({ semver: '~1.2.3' })).toBe('1.2.3');
    });

    it('extracts version from caret range', () => {
      expect(deriveChartTag({ semver: '^1.2.3' })).toBe('1.2.3');
    });

    it('extracts version with pre-release suffix', () => {
      expect(deriveChartTag({ semver: '>=1.2.3-beta.1' })).toBe('1.2.3-beta.1');
    });

    it('extracts bare version', () => {
      expect(deriveChartTag({ semver: '1.2.3' })).toBe('1.2.3');
    });
  });

  describe('patch wildcards', () => {
    it('handles 1.2.x', () => {
      expect(deriveChartTag({ semver: '1.2.x' })).toBe('1.2.0');
    });

    it('handles 1.2.*', () => {
      expect(deriveChartTag({ semver: '1.2.*' })).toBe('1.2.0');
    });

    it('handles 1.2.X', () => {
      expect(deriveChartTag({ semver: '1.2.X' })).toBe('1.2.0');
    });

    it('handles ~1.2.x', () => {
      expect(deriveChartTag({ semver: '~1.2.x' })).toBe('1.2.0');
    });
  });

  describe('minor wildcards', () => {
    it('handles 1.x', () => {
      expect(deriveChartTag({ semver: '1.x' })).toBe('1.0.0');
    });

    it('handles 1.*', () => {
      expect(deriveChartTag({ semver: '1.*' })).toBe('1.0.0');
    });

    it('handles 1.X', () => {
      expect(deriveChartTag({ semver: '1.X' })).toBe('1.0.0');
    });

    it('handles 1.x.x', () => {
      expect(deriveChartTag({ semver: '1.x.x' })).toBe('1.0.0');
    });

    it('handles 1.*.*', () => {
      expect(deriveChartTag({ semver: '1.*.*' })).toBe('1.0.0');
    });

    it('handles ^1.x', () => {
      expect(deriveChartTag({ semver: '^1.x' })).toBe('1.0.0');
    });
  });

  describe('full wildcards', () => {
    it('handles *', () => {
      expect(deriveChartTag({ semver: '*' })).toBe('0.0.0');
    });

    it('handles x', () => {
      expect(deriveChartTag({ semver: 'x' })).toBe('0.0.0');
    });

    it('handles X', () => {
      expect(deriveChartTag({ semver: 'X' })).toBe('0.0.0');
    });

    it('handles x.x.x', () => {
      expect(deriveChartTag({ semver: 'x.x.x' })).toBe('0.0.0');
    });

    it('handles *.*.*', () => {
      expect(deriveChartTag({ semver: '*.*.*' })).toBe('0.0.0');
    });
  });

  it('handles leading/trailing whitespace', () => {
    expect(deriveChartTag({ semver: ' 1.2.x ' })).toBe('1.2.0');
    expect(deriveChartTag({ semver: ' ~1.2.3 ' })).toBe('1.2.3');
  });
});
