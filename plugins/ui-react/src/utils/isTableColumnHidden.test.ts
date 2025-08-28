import { isTableColumnHidden } from './isTableColumnHidden';

describe('isTableColumnHidden', () => {
  it('returns false when column name is not provided', () => {
    expect(isTableColumnHidden(undefined)).toBe(false);
  });

  it('returns false when column is found in queryParameters', () => {
    expect(
      isTableColumnHidden('test-column', {
        queryParameters: { 'test-column': 'value' },
      }),
    ).toBe(false);

    expect(
      isTableColumnHidden('test-column', {
        queryParameters: { 'test-column': ['value1', 'value2'] },
      }),
    ).toBe(false);
  });

  it('returns true when column is not found in visibleColumns', () => {
    expect(
      isTableColumnHidden('test-column', {
        visibleColumns: ['other-column'],
      }),
    ).toBe(true);
  });

  it('returns false when column is found in visibleColumns', () => {
    expect(
      isTableColumnHidden('test-column', {
        visibleColumns: ['test-column', 'other-column'],
      }),
    ).toBe(false);
  });

  it('returns defaultValue when visibleColumns is empty', () => {
    expect(
      isTableColumnHidden('test-column', {
        defaultValue: true,
      }),
    ).toBe(true);

    expect(
      isTableColumnHidden('test-column', {
        defaultValue: false,
      }),
    ).toBe(false);
  });

  it('prioritizes queryParameters over visibleColumns', () => {
    expect(
      isTableColumnHidden('test-column', {
        queryParameters: { 'test-column': 'value' },
        visibleColumns: ['other-column'],
      }),
    ).toBe(false);
  });

  it('uses default options when none are provided', () => {
    expect(isTableColumnHidden('test-column')).toBe(false);
  });
});
