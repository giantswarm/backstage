import { findEpicLink } from './epicLink';

describe('findEpicLink', () => {
  it('finds the conventional Epic header link', () => {
    const markdown = [
      '# Agent Platform MVP',
      '',
      '**Epic:** [giantswarm/giantswarm#36625](https://github.com/giantswarm/giantswarm/issues/36625)',
      '**Go-to-market Rock:** [giantswarm/giantswarm#36368](https://github.com/giantswarm/giantswarm/issues/36368)',
    ].join('\n');

    expect(findEpicLink(markdown)).toEqual({
      label: 'giantswarm/giantswarm#36625',
      url: 'https://github.com/giantswarm/giantswarm/issues/36625',
    });
  });

  it('accepts a bare URL and derives the label', () => {
    const markdown =
      '**Epic**: https://github.com/giantswarm/giantswarm/issues/42';

    expect(findEpicLink(markdown)).toEqual({
      label: 'giantswarm/giantswarm#42',
      url: 'https://github.com/giantswarm/giantswarm/issues/42',
    });
  });

  it('returns undefined without an Epic header', () => {
    expect(findEpicLink('# Plan without epic')).toBeUndefined();
  });
});
