import { withoutLayers } from './resolvedFontSize';

const squash = (css: string) => css.replace(/\s+/g, ' ').trim();

describe('withoutLayers', () => {
  it('unwraps layer blocks, nested ones too, and drops layer statements', () => {
    expect(
      squash(
        withoutLayers(
          '@layer a, b; @layer a { .x { color: red; } @layer b { .y { margin: 0; } } } .z { padding: 0; }',
        ),
      ),
    ).toBe('.x { color: red; } .y { margin: 0; } .z { padding: 0; }');
  });

  it('ignores an @layer inside a comment', () => {
    expect(
      squash(withoutLayers('/* uses @layer for order { */ .x { color: red; }')),
    ).toBe('.x { color: red; }');
  });

  it('throws on a layer block whose braces do not close', () => {
    expect(() => withoutLayers('@layer a { .x { color: red; }')).toThrow(
      /unbalanced/,
    );
  });
});
