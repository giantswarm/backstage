/**
 * How many options a Select needs before it offers type-ahead. Not the list
 * search threshold (`SEARCH_MIN`): a dropdown's options are scanned in place,
 * and type-ahead pays off only once scrolling to the one wanted stops working.
 */
const TYPEAHEAD_MIN = 8;

/**
 * Whether a Select over these options offers type-ahead: only past
 * {@link TYPEAHEAD_MIN}. Three installations are read, not searched; a search
 * box over them is chrome.
 *
 * `<Select searchable={searchableIf(options)} options={options} />`
 */
export function searchableIf(options: readonly unknown[]): boolean {
  return options.length > TYPEAHEAD_MIN;
}
