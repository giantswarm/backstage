import { createMarkdownLinkResolver } from './resolveMarkdownLink';

const TRIVY_README =
  'https://raw.githubusercontent.com/giantswarm/trivy-app/refs/tags/v0.18.1/README.md';
const TRIVY_BLOB =
  'https://github.com/giantswarm/trivy-app/blob/refs/tags/v0.18.1';

describe('createMarkdownLinkResolver', () => {
  describe('with a raw.githubusercontent.com source', () => {
    const resolve = createMarkdownLinkResolver(TRIVY_README)!;

    it.each([
      ['helm/trivy/values.yaml', `${TRIVY_BLOB}/helm/trivy/values.yaml`],
      ['./helm/trivy/values.yaml', `${TRIVY_BLOB}/helm/trivy/values.yaml`],
      ['docs/../README.md', `${TRIVY_BLOB}/README.md`],
      ['/helm/trivy/Chart.yaml', `${TRIVY_BLOB}/helm/trivy/Chart.yaml`],
      ['../../../LICENSE', `${TRIVY_BLOB}/LICENSE`],
      ['docs/', `${TRIVY_BLOB}/docs/`],
      ['CHANGELOG.md#v0181', `${TRIVY_BLOB}/CHANGELOG.md#v0181`],
      ['values.yaml?plain=1', `${TRIVY_BLOB}/values.yaml?plain=1`],
    ])('resolves %s to the file at the same ref', (href, expected) => {
      expect(resolve(href)).toBe(expected);
    });

    it('resolves against the directory of a document in a subdirectory', () => {
      const resolveNested = createMarkdownLinkResolver(
        'https://raw.githubusercontent.com/giantswarm/trivy-app/refs/tags/v0.18.1/docs/guide/README.md',
      )!;

      expect(resolveNested('setup.md')).toBe(
        `${TRIVY_BLOB}/docs/guide/setup.md`,
      );
      expect(resolveNested('../../README.md')).toBe(`${TRIVY_BLOB}/README.md`);
    });

    it('takes a single-segment ref', () => {
      const resolveTag = createMarkdownLinkResolver(
        'https://raw.githubusercontent.com/giantswarm/trivy-app/v0.18.1/README.md',
      )!;

      expect(resolveTag('helm/trivy/values.yaml')).toBe(
        'https://github.com/giantswarm/trivy-app/blob/v0.18.1/helm/trivy/values.yaml',
      );
    });

    it('takes a refs/heads ref', () => {
      const resolveBranch = createMarkdownLinkResolver(
        'https://raw.githubusercontent.com/giantswarm/trivy-app/refs/heads/main/README.md',
      )!;

      expect(resolveBranch('LICENSE')).toBe(
        'https://github.com/giantswarm/trivy-app/blob/refs/heads/main/LICENSE',
      );
    });

    it.each([
      '#configuration',
      'https://example.com/docs',
      'mailto:support@example.com',
      '//example.com/docs',
      '',
    ])('leaves %p unchanged', href => {
      expect(resolve(href)).toBe(href);
    });

    it.each([
      // eslint-disable-next-line no-script-url
      'javascript:alert(1)',
      // eslint-disable-next-line no-script-url
      'JavaScript:alert(1)',
      'data:text/html,hi',
    ])('drops the unsafe link %p', href => {
      expect(resolve(href)).toBe('');
    });
  });

  it('resolves against a github.com blob source', () => {
    const resolve = createMarkdownLinkResolver(
      'https://github.com/giantswarm/klaus-personalities/blob/main/personalities/sre/SOUL.md',
    )!;

    expect(resolve('../shared/TOOLS.md')).toBe(
      'https://github.com/giantswarm/klaus-personalities/blob/main/personalities/shared/TOOLS.md',
    );
  });

  it('resolves against any other http(s) source', () => {
    const resolve = createMarkdownLinkResolver(
      'https://example.com/docs/guide/README.md',
    )!;

    expect(resolve('setup.md')).toBe('https://example.com/docs/guide/setup.md');
    expect(resolve('/index.html')).toBe('https://example.com/index.html');
  });

  it.each([undefined, '', 'not a url', 'file:///README.md'])(
    'returns undefined for the source %p',
    sourceUrl => {
      expect(createMarkdownLinkResolver(sourceUrl)).toBeUndefined();
    },
  );
});
