import { annotationLines } from './annotationLines';

describe('annotationLines', () => {
  it('says when the connector declares nothing', () => {
    expect(annotationLines()).toEqual([
      'None declared, so it counts as changing things',
    ]);
    expect(annotationLines({})).toEqual([
      'None declared, so it counts as changing things',
    ]);
  });

  it('calls a read-only tool one that only reads, whatever else it claims', () => {
    expect(
      annotationLines({
        readOnlyHint: true,
        destructiveHint: true,
        idempotentHint: true,
      }),
    ).toEqual(['Only reads']);
  });

  it('refines a tool that changes things by its other hints', () => {
    expect(
      annotationLines({ destructiveHint: true, idempotentHint: true }),
    ).toEqual([
      'Can change things',
      'Can delete or overwrite',
      'Running it again with the same inputs changes nothing more',
    ]);
    expect(annotationLines({ destructiveHint: false })).toEqual([
      'Can change things',
      'Only adds, never deletes or overwrites',
    ]);
  });

  it('says whether it reaches outside its connector', () => {
    expect(
      annotationLines({ readOnlyHint: true, openWorldHint: true }),
    ).toEqual(['Only reads', 'Reaches systems outside its connector']);
    expect(annotationLines({ openWorldHint: false })).toEqual([
      'Can change things',
      'Stays within its connector’s own data',
    ]);
  });
});
