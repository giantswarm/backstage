import { SEARCH_MIN } from '../components/ShowMore/ShowMore';

/**
 * Whether a Select over these options offers type-ahead: only past
 * {@link SEARCH_MIN}, where scrolling to the one wanted stops working. Three
 * installations are read, not searched; a search box over them is chrome.
 *
 * `<Select searchable={searchableIf(options)} options={options} />`
 */
export function searchableIf(options: readonly unknown[]): boolean {
  return options.length > SEARCH_MIN;
}
