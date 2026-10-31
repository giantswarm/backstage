import { SEARCH_MIN } from '../components/ShowMore/ShowMore';

/**
 * Whether a Select over these options offers type-ahead: from
 * {@link SEARCH_MIN} options on, the same rule as a list's search
 * (`isSearchableList`).
 *
 * `<Select searchable={searchableIf(options)} options={options} />`
 */
export function searchableIf(options: readonly unknown[]): boolean {
  return options.length >= SEARCH_MIN;
}
