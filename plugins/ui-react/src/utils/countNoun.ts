/** `1 tool` / `3 tools`. */
export function countNoun(
  count: number,
  noun: string,
  plural = `${noun}s`,
): string {
  return `${count} ${count === 1 ? noun : plural}`;
}
