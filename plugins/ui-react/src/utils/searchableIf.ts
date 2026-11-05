import { isSearchableList } from '../components/ShowMore/ShowMore';

/**
 * Whether a Select over these options offers type-ahead: the same rule as a
 * list's search ({@link isSearchableList}), counted over its options.
 *
 * `<Select searchable={searchableIf(options)} options={options} />`
 */
export function searchableIf(options: readonly unknown[]): boolean {
  return isSearchableList(options.length);
}
