/** `items` as a sentence lists them: "a", "a and b", "a, b and c". */
export function listOf(items: string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
